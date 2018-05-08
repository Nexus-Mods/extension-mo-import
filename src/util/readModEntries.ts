import {IModEntry} from '../types/moEntries';

import * as Promise from 'bluebird';
import * as path from 'path';
import { fs, log, types, util } from 'vortex-api';
import IniParser, { IniFile, WinapiFormat } from 'vortex-parse-ini';

const parser: IniParser = new IniParser(new WinapiFormat());

function convertMOVersion(input: string): string {
  return input.replace(/^[df]/, '');
}

interface IMetaInfo {
  modid: number;
  fileid: number;
  installationFile: string;
  version: string;
  categoryIds: number[];
}

function parseMetaIni(modPath: string): Promise<IMetaInfo> {
  return parser.read(path.join(modPath, 'meta.ini'))
      .then((ini: any) => {
        const fileId = ini.data.installedFiles !== undefined
          ? ini.data.installedFiles['1\\fileid']
          : undefined;
        const categoryIds = ini.data.General.category.replace(/^"|"$/g, '').split(',');
        return {
          modid: parseInt(ini.data.General.modid, 10),
          fileid: fileId !== undefined ? parseInt(fileId, 10) : undefined,
          installationFile: ini.data.General.installationFile,
          version: convertMOVersion(ini.data.General.version),
          categoryIds: categoryIds.map(id => parseInt(id, 10)),
        };
      });
}

function dirsOnly(filePath: string): Promise<boolean> {
  return fs.statAsync(filePath)
      .then(stat => stat.isDirectory())
      .catch(err => ['EACCESS', 'EPERM'].indexOf(err.code) !== -1
        ? Promise.resolve(false)
        : Promise.reject(err));
}

function readModEntries(basePath: string,
                        mods: { [modId: string]: types.IMod }): Promise<IModEntry[]> {
  return fs.readdirAsync(basePath)
    .filter((fileName: string) => dirsOnly(path.join(basePath, fileName)))
    .map((modPath: string) => parseMetaIni(path.join(basePath, modPath))
      .then((metaInfo: IMetaInfo): IModEntry => ({
        vortexId: modPath,
        nexusId: metaInfo.modid.toString(),
        downloadId: metaInfo.fileid,
        modName: modPath,
        archiveName: metaInfo.installationFile,
        modVersion: metaInfo.version,
        importFlag: true,
        isAlreadyManaged: util.getSafe(mods, [modPath], undefined) !== undefined,
        categoryId: metaInfo.categoryIds[0],
      }))
      .catch(err => {
        log('warn', 'failed to read MO mod', { modPath, err: err.message });
        return undefined;
      }))
    .filter<IModEntry>(entry => entry !== undefined)
    .catch(err => {
      log('warn', 'failed to read MO base path', { basePath, err: err.message });
      return [];
    });
}

export default readModEntries;
