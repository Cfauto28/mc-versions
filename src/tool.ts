#!/usr/bin/env -S deno run -A
import { encodeHex } from "jsr:@std/encoding/hex";
import { crypto } from "jsr:@std/crypto";

//import { MainManifest, VersionData, OmniarchiveMainManifest, OmniVersionManifest } from './types.d.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function readLocalVersionJsons() {
    const versionsMap: Map<string, VersionManifest> = new Map();
    for await (const file of Deno.readDir(('data/version/manifest'))) {
        const version: VersionManifest = JSON.parse(await Deno.readTextFile('data/version/manifest/' + file.name));
        versionsMap.set(version.id, version);
    }
    return versionsMap;
}

async function readLocalDetailsJsons() {
    const detailsMap: Map<string, VersionData> = new Map();
    for await (const file of Deno.readDir('data/version')) {
        if (file.isDirectory) continue;
        const versionDetails = JSON.parse(await Deno.readTextFile('data/version/' + file.name));
        detailsMap.set(versionDetails.id, versionDetails);
    }
    return detailsMap;
}

async function readAndCacheExternalVersionJsons(remoteManifestJson: OmniarchiveMainManifest) {
    const versionsMap: Map<string, OmniVersionManifest> = new Map();
    for (const version of remoteManifestJson.versions) {
        const versionJson: OmniVersionManifest = await (await fetch(version.url)).json();

        console.log(`Writing ${versionJson.id}.json`);
        await Deno.writeTextFile(`external_manifests/${versionJson.id}.json`, JSON.stringify(versionJson, null, 2));
        await sleep(1000);

        versionsMap.set(version.id, versionJson);
    }
    console.log('\nUpdate complete!');
    return versionsMap;
}

async function readCachedExternalVersionJsons() {
    try {
        await Deno.lstat('external_manifests');
    } catch (error) {
        if(!(error instanceof Deno.errors.NotFound)) throw error;
        return null;
    }
    const cacheDirectory = Deno.readDir('external_manifests');

    const versionsMap: Map<string, OmniVersionManifest> = new Map();
    for await (const file of cacheDirectory) {
        const versionManifest = JSON.parse(await Deno.readTextFile('external_manifests/' + file.name));
        versionsMap.set(versionManifest.id, versionManifest);
    }
    return versionsMap;
}

// Versions that we rename with respect to the Omniarchive manifest
const localToRemoteMap: { [key: string]: string } = {
    // Versions of which a single re-release has been found, so the disambiguation suffix is not required as of now
    "c0.30-s": "c0.30-s-1858",
    "1.3": "1.3-pre-1249",
    "12w39a": "12w39a-1243",
    "1.5.2-pre": "1.5.2-pre-250703",
    // Pre-release versions that do not have the -pre suffix in the official Minecraft manifest
    "1.2": "1.2-pre",
}
const ignoreList: string[] = [
    // Standalone server versions are not included in the Omniarchive manifest
    // "b1.3-1647",
    // "b1.3-1731",
    "13w03a-1538"
]

function compareLocalWithOmniarchive(localVersionsMap: Map<string, VersionManifest>, remoteVersionsMap: Map<string, OmniVersionManifest>) {
    const missing = [];
    localVersionsMap.forEach((_value, key) => {
        // Omniarchive does not have standalone Classic or Alpha servers, they are included in their most closely associated client version
        if (key.startsWith('server-')) return;
        if (ignoreList.includes(key)) return;

        const version = localToRemoteMap[key] ?? key;
        if (!remoteVersionsMap.has(version)) {
            console.log(`Omniarchive manifest is missing ${version}`);
            missing.push(version);
        }
    });

    console.log(`\nOmniarchive manifest is missing ${missing.length} versions`);
}

async function updateLocalManifestHashes(manifest: MainManifest) {
    for (let i = 0; i < manifest.versions.length; i++) {
        const version = manifest.versions[i];
        const manifestFileStream = (await Deno.open(`data/${version.url}`, { read: true })).readable;
        const detailsFileStream = (await Deno.open(`data/${version.details}`, { read: true })).readable;
        const manifestHashBuffer = await crypto.subtle.digest('SHA-1', manifestFileStream);
        const detailsHashBuffer = await crypto.subtle.digest('SHA-1', detailsFileStream);
        manifest.versions[i].sha1 = encodeHex(manifestHashBuffer);
        manifest.versions[i].detailsSha1 = encodeHex(detailsHashBuffer);
    }
    await Deno.writeTextFile('data/version_manifest.json', JSON.stringify(manifest, null, 2));
    console.log('Hashes updated');
}

(async () => {
    const localManifestJson: MainManifest = JSON.parse(await Deno.readTextFile('data/version_manifest.json'));
    const localVersionJsonsMap = await readLocalVersionJsons();
    const localDetailsJsonsMap = await readLocalDetailsJsons();

    const remoteManifestJson: OmniarchiveMainManifest = await (await fetch('https://meta.omniarchive.uk/v1/manifest.json')).json();
    let remoteVersionJsonsMap = await (async () => {
        const cached = await readCachedExternalVersionJsons();
        if (cached && cached.size > 0) return cached;
        console.log('Cache does not exist! Creating...\n');
        return await readAndCacheExternalVersionJsons(remoteManifestJson);
    })();

    console.log('Locally stored manifests loaded');

    while (true) {
        console.log('\nWelcome to the new version manifest update and compare tool!');
        console.log('1: Update sha1 hashes in the main versions manifest');
        console.log('2: Compare local manifests with external (Omniarchive) manifests');
        console.log('3: Update and cache external (Omniarchive) manifests');
        console.log('E: Exit');
        const option = prompt('Choose an option: ');
        console.log();

        switch (option) {
            case '1':
                await updateLocalManifestHashes(localManifestJson);
                break;
            case '2':
                compareLocalWithOmniarchive(localVersionJsonsMap, remoteVersionJsonsMap);
                break;
            case '3': {
                const confirmation = confirm('Are you sure? This will take a while');
                console.log();
                if (confirmation) remoteVersionJsonsMap = await readAndCacheExternalVersionJsons(remoteManifestJson);
                break;
            }
            case 'e':
            case 'E':
                console.log('Goodbye!');
                return;
            case null:
                console.log('null!?');
            /* falls through */
            default:
                console.log('Invalid option');
                break;
        }
    }
})();