'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const { randomUUID } = require('node:crypto');

// Read, derive, persist and commit form one transaction, including asynchronous disk I/O.
function createSettingsTransaction({ get, validate, persist, commit }) {
  let tail = Promise.resolve();
  return function mutate(derive) {
    const result = tail.catch(() => {}).then(async () => {
      const next = validate(derive(get()));
      await persist(next);
      commit(next);
      return next;
    });
    tail = result;
    return result;
  };
}

async function backupUnreadable(file) {
  const suffix = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${file}.${suffix}.${randomUUID().slice(0, 8)}.recovery`;
  await fs.copyFile(file, backup, constants.COPYFILE_EXCL);
  return backup;
}

module.exports = { createSettingsTransaction, backupUnreadable };
