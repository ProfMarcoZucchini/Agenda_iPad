import { __backupTest as backup } from './backup.js';

// Nessun DOM, rendering o evento Pencil su questo thread.
self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.task === 'build') {
      const args = data.args;
      const clipboardSnapshot = await backup.collectClipboardSnapshot(args.mainDbName, args.clipboardRaw, args.imageBlobs);
      result = await backup.makeBackupPackage({ ...args, clipboardSnapshot });
    } else if (data.task === 'verify') {
      result = await backup.verifyBackupBlob(data.args.blob);
      if (data.args.compact) result = { manifest: result.manifest };
    } else throw new Error('Operazione backup sconosciuta');
    self.postMessage({ result });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
