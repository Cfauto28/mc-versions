#!/usr/bin/env -S deno run -A
import { encodeHex } from "jsr:@std/encoding/hex";
import { crypto } from "jsr:@std/crypto";

//import { MainManifest, VersionData, OmniarchiveMainManifest, OmniVersionManifest } from './types.d.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getFileSha1 = async (path: string): Promise<string> => encodeHex((await crypto.subtle.digest('SHA-1', (await Deno.open(path, { read: true })).readable)));

async function fileExists(path: string) {
    try {
        return await Deno.lstat(path) as unknown as boolean;
    } catch (error) {
        if(!(error instanceof Deno.errors.NotFound)) throw error;
        return false;
    }
}

async function readLocalVersionJsons() {
    const versionsMap: Map<string, VersionManifest> = new Map();
    for await (const file of Deno.readDir(('data/version/manifest'))) {
        const version: VersionManifest = JSON.parse(await Deno.readTextFile(`data/version/manifest/${file.name}`));
        versionsMap.set(version.id, version);
    }
    return versionsMap;
}

async function readLocalDetailsJsons() {
    const detailsMap: Map<string, VersionData> = new Map();
    for await (const file of Deno.readDir('data/version')) {
        if (file.isDirectory) continue;
        const versionDetails = JSON.parse(await Deno.readTextFile(`data/version/${file.name}`));
        detailsMap.set(versionDetails.id, versionDetails);
    }
    return detailsMap;
}

async function updateAndCacheExternalVersionJsons(remoteManifestJson: OmniarchiveMainManifest) {
    const versionsMap: Map<string, OmniVersionManifest> = new Map();
    for (const version of remoteManifestJson.versions) {
        let versionJson: OmniVersionManifest;

        const versionJsonPath = `external_manifests/ugly/${version.id}.json`;
        if (await fileExists(versionJsonPath) && version.sha1 === await getFileSha1(versionJsonPath)) {
            versionJson = JSON.parse(await Deno.readTextFile(versionJsonPath));
            console.log(`${version.id}.json is already up to date`);
        } else {
            versionJson = await (await fetch(version.url)).json();

            console.log(`Writing ${version.id}.json`);
            await Deno.writeTextFile(versionJsonPath, `${JSON.stringify(versionJson)}\n`);
            await Deno.writeTextFile(`external_manifests/${version.id}`, JSON.stringify(versionJson, null, 2));
            await sleep(1000);
        }

        versionsMap.set(version.id, versionJson);
    }
    console.log('\nUpdate complete!');
    return versionsMap;
}

async function readCachedExternalVersionJsons() {
    const cacheDir = 'external_manifests/ugly';
    if (!(await fileExists(cacheDir))) {
        await Deno.mkdir(cacheDir);
        return null;
    }

    const versionsMap: Map<string, OmniVersionManifest> = new Map();
    for await (const file of Deno.readDir(cacheDir)) {
        const versionManifest = JSON.parse(await Deno.readTextFile(`${cacheDir}/${file.name}`));
        versionsMap.set(versionManifest.id, versionManifest);
    }
    return versionsMap;
}

type LocalId = VersionId;
type MirrorId = LocalId;
type LocalOriginalId = LocalId;
type ExternalOriginalId = VersionId;
type IndexOriginalId = VersionId;
// Local server versions that do not exist by themselves in the Omniarchive manifest, but are included in a closely associated client version
const standaloneSevers: VersionId[] = [
    "c1.2",
    "c1.4-1422",
    "c1.4.1",
    "c1.6",
    "c1.8.2",
    "c1.8.3",
    "c1.9.1",
    "c1.10.1",
    "a0.1.0",
    "a0.1.1-1707",
    "a0.1.2_01",
    "a0.1.3",
    "a0.1.4",
    "a0.2.0",
    "a0.2.0_01",
    "a0.2.1",
    "a0.2.2",
    "a0.2.2_01",
    "a0.2.3",
    "a0.2.4",
    "a0.2.5-0923",
    "a0.2.5-1004",
    "a0.2.5_01",
    "a0.2.5_02",
    "a0.2.6_01",
    "a0.2.6_02",
    "a0.2.7",
    "a0.2.8",
    "b1.3-1647",
    "b1.3-1731",
    // TODO Omniarchive manifest has mixed servers
    "b1.5_02",
    "b1.8-pre2-131240",
    "b1.9-pre4-1425",
    "1.0.1",
    "13w16a-181800",
    "13w22a-1608",
    "1.6.3-171031",
    "1.6.4-201404010657",
    "13w36a-1330",
    "13w36b-1233",
    "13w39a-1627",
    "13w41b-1507",
    "14w04a-1740",
    "1.7.5-04010700",
    "14w11b-1640"
];
// Standalone server versions that have a different ID in the local manifest than in the Omniarchive index
const renamedStandaloneServers: Map<LocalId, IndexOriginalId> = new Map([
    ["1.6.3-171031", "1.6.3-pre-171031"],
    ["13w36b-1233", "13w36b"],
    ["13w41b-1507", "13w41b"],
    ["14w11b-1640", "14w11b"]
]);
// Local server versions that are not in the Omniarchive manifest at all
const orphanServers: VersionId[] = [
    "c1.3",
    "c1.4-1327",
    "c1.10",
    "a0.2.6",
    "b1.6-trailer",
    "b1.9-pre4-1441",
    "13w03a-1538",
    "13w16b-2118",
    "13w23b-0033",
    "1.6-1304",
    "13w38c-1511",
    "1.7-1500",
    "14w10c-1518",
    "17w18a-1331"
];
// Orphaned server versions that have a different ID in the local manifest than in the Omniarcive index
const renamedOrphanServers: Map<LocalId, IndexOriginalId> = new Map([
    ["1.6-1304", "1.6-pre-1304"],
    ["1.7-1500", "1.7-pre-1500"]
]);
// Versions that got renamed in our manifest that does not mirror a version with an Omniarchive id
const mirrorlessRenameMap: Map<LocalId, ExternalOriginalId> = new Map([
    ["rd-132211-launcher", "pc-132011-launcher"],
    // TODO "launchermeta.mojang.com" and "launcher.mojang.com" vs "piston-meta.mojang.com" and "piston-data.mojang.com", respectively
    ["rd-132328-launcher", "pc-132128-launcher"],
    ["rd-160052-launcher", "pc-152252-launcher"],
    ["rd-161348-launcher", "pc-161148-launcher"],
    ["1.3-1249", "1.3-pre-1249"],
    ["1.2", "1.2-pre"],
    ["1.4", "1.4-pre"],
    ["1.4.1-1338", "1.4.1-pre-1338"],
    ["1.4.3", "1.4.3-pre"],
    ["1.6-1517", "1.6-pre-1517"],
    ["1.6.3-131100", "1.6.3-pre-131100"],
    ["1.6.3-171231", "1.6.3-pre-171231"],
    ["1.7-1602", "1.7-pre-1602"],
    ["1.7.1", "1.7.1-pre"],
    ["1.7.3", "1.7.3-pre"]
]);
// Versions without disambiguation that are duplicate ("mirror") copies of a local version with disambiguation
const mirrorMap: Map<MirrorId, LocalOriginalId> = new Map([
    ["c0.0.12a_03", "c0.0.12a_03-200018"],
    ["c0.0.15a", "c0.0.15a-05311904"],
    ["c0.0.16a_02", "c0.0.16a_02-081047"],
    ["c0.0.17a", "c0.0.17a-2014"],
    ["c1.4", "c1.4-1422"],
    ["c0.0.19a_06", "c0.0.19a_06-0137"],
    ["c0.0.21a", "c0.0.21a-2008"],
    ["c0.30-s", "c0.30-s-1858"],
    ["c0.30-c", "c0.30-c-1900"],
    ["c0.30-c-renew", "c0.30-c-1900-renew"],
    ["a1.0.5", "a1.0.5-2149"],
    ["a1.0.13_01", "a1.0.13_01-1444"],
    ["a1.0.14", "a1.0.14-1659"],
    ["a0.1.1", "a0.1.1-1707"],
    ["a1.1.0", "a1.1.0-131933"],
    ["a1.2.0", "a1.2.0-2057"],
    ["a1.2.2", "a1.2.2-1938"],
    ["a1.2.3_01", "a1.2.3_01-0958"],
    ["a0.2.5", "a0.2.5-1004"],
    ["b1.0.2", "b1.0.2-0841"],
    ["b1.8-pre1", "b1.8-pre1-091358"],
    ["1.0.0-rc2", "1.0.0-rc2-1656"],
    ["12w05a", "12w05a-1442"],
    ["12w17a", "12w17a-1424"],
    ["1.3", "1.3-1249"],
    ["12w32a", "12w32a-1532"],
    ["12w39a", "12w39a-1243"],
    ["1.4.1", "1.4.1-1338"],
    ["13w03a", "13w03a-1647"],
    ["13w05a", "13w05a-1538"],
    ["13w06a", "13w06a-1636"],
    ["13w12~", "13w12~-1439"],
    ["13w16b", "13w16b-2151"],
    ["13w23b", "13w23b-0101"],
    ["1.6", "1.6-1517"],
    // TODO look at this
    ["1.6.2", "1.6.2-091847"],
    ["13w38c", "13w38c-1516"],
    ["1.7", "1.7-1602"],
    ["14w04b", "14w04b-1554"],
    ["1.7.10-pre2", "1.7.10-pre2-1045"],
    ["14w27b", "14w27b-1646"],
    ["14w34c", "14w34c-1549"],
    ["17w13a", "17w13a-0932"],
    ["17w18a", "17w18a-1450"],
    ["1.12-pre3", "1.12-pre3-1409"],
    ["19w13b", "19w13b-1653"],
    ["1.14.2-pre4", "1.14.2-pre4-270720"]
]);
// Disambiguated versions that are supposed to exist as the "original" version ID, but for whatever reason the Omniarchive manifest has used the "mirror" version ID instead
const reverseMirrorMap: Map<MirrorId, LocalOriginalId> = new Map([
    ["14w10c-1351", "14w10c"]
]);
// Mirrors that don't come from a single source but rather contain download links from two different "original" version manifests (one client and another server)
const mergedMirrorMap: Map<MirrorId, [client: LocalOriginalId, server: LocalOriginalId]> = new Map([
    ["b1.1", ["b1.1-1255", "b1.1-1245"]],
    ["b1.3", ["b1.3-1750", "b1.3-1731"]],
    ["b1.4", ["b1.4-1634", "b1.4-1507"]],
    ["b1.8-pre2", ["b1.8-pre2-131225", "b1.8-pre2-131240"]],
    ["b1.9-pre3", ["b1.9-pre3-1402", "b1.9-pre3-1350"]],
    ["b1.9-pre4", ["b1.9-pre4-1435", "b1.9-pre4-1441"]],
    ["13w16a", ["13w16a-192037", "13w16a-191517"]],
    ["13w22a", ["13w22a-1434", "13w22a-1608"]],
    ["1.6.3", ["1.6.3-171231", "1.6.3-171031"]],
    ["13w36a", ["13w36a-1446", "13w36a-1330"]],
    ["13w36b", ["13w36b-1307", "13w36b-1233"]],
    ["1.6.4", ["1.6.4-201309191549", "1.6.4-201404010657"]],
    ["13w39a", ["13w39a-1511", "13w39a-1627"]],
    ["13w41b", ["13w41b-1523", "13w41b-1507"]],
    ["14w04a", ["14w04a-1526", "14w04a-1740"]],
    ["1.7.5", ["1.7.5-02260922", "1.7.5-04010700"]],
    ["14w11b", ["14w11b-1650", "14w11b-1640"]],
    ["1.7.7", ["1.7.7-101331", "1.7.7-091529"]]
]);
// Versions that had disambiguation added to the local manifests, but which don't exist as is in the Omniarchive manifest (with server versions that are unavailable in the Omniarchive manifest)
const weirdMergeMap: Map<LocalId, [client: ExternalOriginalId, server: IndexOriginalId]> = new Map([
    ["13w22a-1434", ["13w22a", "13w22a-1434"]],
    ["1.6.4-201309191549", ["1.6.4", "1.6.4-201309191549"]],
    ["13w39a-1511", ["13w39a", "13w39a-1511"]],
    // Since only the jar got reuploaded, Omniarchive's manifest doesn't have the jar version, but *does* contain the Windows server exe
    ["14w04a-1526", ["14w04a", "14w04a-1526"]],
    ["1.7.5-02260922", ["1.7.5", "1.7.5-02260922"]]
]);

const shouldSkip = (key: string): boolean => !(standaloneSevers.includes(key) || orphanServers.includes(key) ||
    mirrorlessRenameMap.has(key) || mirrorMap.has(key) || reverseMirrorMap.has(key) || mergedMirrorMap.has(key) || weirdMergeMap.has(key));

export { standaloneSevers, renamedStandaloneServers, orphanServers, renamedOrphanServers, mirrorlessRenameMap, mirrorMap, reverseMirrorMap, mergedMirrorMap, weirdMergeMap }

function compareLocalWithOmniarchive(localVersionsMap: Map<string, VersionManifest>, remoteVersionsMap: Map<string, OmniVersionManifest>) {
    const missingExternal = [];

    localVersionsMap.forEach((_value, key) => {
        if (shouldSkip(key) && !remoteVersionsMap.has(key)) {
            console.log(`%cOmniarchive manifest is missing ${key}`, 'color: red');
            missingExternal.push(key);
        }
    });

    console.log(`Skipped ${standaloneSevers.length + orphanServers.length + mirrorlessRenameMap.size + mirrorMap.size + reverseMirrorMap.size + mergedMirrorMap.size + weirdMergeMap.size} versions
    - ${standaloneSevers.length} server versions included in most closely related client in the Omniarchive manifest
    - ${orphanServers.length} server versions that are not included in the Omniarchive manifest at all
    - ${mirrorlessRenameMap.size} versions (that are not copies of another local manifest) with a disambiguation removed when compared to its respective Omniarchive manifest (i.e. Omniarchive's 1.7.1-pre is just 1.7.1 in this manifest)
    - ${mirrorMap.size} versions that are copies of a version with a disambiguation suffix (e.g. 14w04b for 14w04b-1554)
    - ${reverseMirrorMap.size} versions that are the reverse of the previous ones
    - ${mergedMirrorMap.size} versions without disambiguation that contain downloads of two different versions (one client and one server)
    - ${weirdMergeMap.size} versions that had a disambiguation added in this manifest to distinguish them from Omniarchive versions without disambiguation and other local versions`);
    console.log(`\nOmniarchive manifest is missing ${missingExternal.length} versions`);

    // const test = remoteVersionsMap.keys().toArray().sort();
    console.log(/*test*/);

    const missingLocal = [];
    const iterable = remoteVersionsMap.entries().filter((entry) =>
        entry[0] <= "1.14.4-pre7" || (entry[0] >= "1.2-pre" && entry[0] <= "1.2.5") || (entry[0] >= "1.3-pre-1249" && entry[0] <= "19w36a")
        || entry[0].startsWith("2.0-") || (entry[0] >= "3D Shareware v1.34" && entry[0] <= "combat3") || entry[0] >= "in-20091223-1459");
    const filteredRemoteMap = new Map(iterable);

    filteredRemoteMap.forEach((_value, key) => {
        if (!localVersionsMap.has(key) && !mirrorlessRenameMap.values().toArray().includes(key)) {
            console.log(`%cThe local manifest is missing ${key}`, 'color: red');
            missingLocal.push(key);
        }
    });

    console.log(`\nLocal manifest is missing ${missingLocal.length} versions`);
}

function checkLocalManifestEntries(manifest: MainManifest, versionJsons: Map<string, VersionManifest>, detailsJsons: Map<string, VersionData>) {
    // log manifest entries with inconsistent references to version jsons and/or details jsons
    for (let i = 0; i < manifest.versions.length; i++) {
        const version = manifest.versions[i];
        if (version.url !== `version/manifest/${version.id}.json`) {
            console.log(`manifest entry for ${version.id} has inconsistent reference to version json ${version.url}`)
        }
        if (version.details !== `version/${version.id}.json`) {
            console.log(`manifest entry for ${version.id} has inconsistent reference to details json ${version.details}`)
        }
    }

    // log any references to unknown versions in the next and previous fields of details jsons
    detailsJsons.forEach((details) => {
        if (details.previous != null) {
            for (let i = 0; i < details.previous.length; i++) {
                const prevId = details.previous[i];
    
                if (!detailsJsons.has(prevId)) {
                    console.log(`details json for ${details.id} references unknown previous version ${prevId}`);
                }
            }
        }
        if (details.next != null) {
            for (let i = 0; i < details.next.length; i++) {
                const prevId = details.next[i];
    
                if (!detailsJsons.has(prevId)) {
                    console.log(`details json for ${details.id} references unknown next version ${prevId}`);
                }
            }
        }
    });

    // log any manifest entries that do not have corresponding version jsons and/or details jsons
    for (let i = 0; i < manifest.versions.length; i++) {
        const version = manifest.versions[i];
        if (!versionJsons.delete(version.id)) {
            console.log(`manifest has version ${version.id} but there is no info json for that version!`)
        }
        if (!detailsJsons.delete(version.id)) {
            console.log(`manifest has version ${version.id} but there is no details json for that version!`)
        }
    }

    // log any version jsons and details jsons that do not have corresponding manifest entries
    versionJsons.forEach((_, id) => console.log(`local info json exists for ${id} but that version is not in the manifest!`));
    detailsJsons.forEach((_, id) => console.log(`local details json exists for ${id} but that version is not in the manifest!`));
}

async function updateLocalManifestHashes(manifest: MainManifest) {
    for (let i = 0; i < manifest.versions.length; i++) {
        const version = manifest.versions[i];
        manifest.versions[i].sha1 = await getFileSha1(`data/${version.url}`);
        manifest.versions[i].detailsSha1 = await getFileSha1(`data/${version.details}`);
    }
    await Deno.writeTextFile('data/version_manifest.json', JSON.stringify(manifest, null, 2));
    console.log('Hashes updated');
}

if (import.meta.main) (async () => {
    const localManifestJson: MainManifest = JSON.parse(await Deno.readTextFile('data/version_manifest.json'));
    const localVersionJsonsMap = await readLocalVersionJsons();
    const localDetailsJsonsMap = await readLocalDetailsJsons();

    const remoteManifestJson: OmniarchiveMainManifest = await (await fetch('https://meta.omniarchive.uk/v1/manifest.json')).json();
    let remoteVersionJsonsMap = await (async () => {
        const cached = await readCachedExternalVersionJsons();
        if (cached && cached.size > 0) return cached;
        console.log('Cache does not exist! Creating...\n');
        return await updateAndCacheExternalVersionJsons(remoteManifestJson);
    })();

    console.log('Locally stored manifests loaded');

    while (true) {
        console.log('\nWelcome to the new version manifest update and compare tool!');
        console.log('1: Validate the main manifest and the local version jsons and details json');
        console.log('2: Update sha1 hashes in the main versions manifest');
        console.log('3: Compare local manifests with external (Omniarchive) manifests');
        console.log('4: Update and cache external (Omniarchive) manifests');
        console.log('E: Exit');
        const option = prompt('Choose an option: ');
        console.log();

        switch (option) {
            case '1':
                checkLocalManifestEntries(localManifestJson, localVersionJsonsMap, localDetailsJsonsMap);
                break;
            case '2':
                await updateLocalManifestHashes(localManifestJson);
                break;
            case '3':
                compareLocalWithOmniarchive(localVersionJsonsMap, remoteVersionJsonsMap);
                break;
            case '4': {
                const confirmation = confirm('Are you sure? This will take a while');
                console.log();
                if (confirmation) remoteVersionJsonsMap = await updateAndCacheExternalVersionJsons(remoteManifestJson);
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