'use strict';

import AwaitLock from 'await-lock';
import sleep from 'sleep-promise';

export class AnySQLCordovaSQLite {
  constructor(url) {
    if (!url) throw new Error('URL is missing');
    let pos = url.indexOf(':');
    let name = pos === -1 ? url : url.substr(pos + 1);
    if (!name) throw new Error('Cordova SQLite database name is missing');
    console.log(name);
    this.awaitLock = new AwaitLock();
    document.addEventListener('deviceready', () => {
      let SQLite = window.cordova.require('cordova-sqlite-plugin.SQLite');
      let sqlite = new SQLite(name);
      sqlite.open(err => {
        if (err) throw err;
        this.sqlite = sqlite;
      });
    }, false);
  }

  async initialize() {
    if (this.sqlite) return;
    let timestamp = Date.now();
    while (!this.sqlite) {
      await sleep(200);
      if (Date.now() - timestamp > 10000) {
        throw new Error('Initialization of AnySQLCordovaSQLite failed');
      }
    }
  }

  async lock(fn) {
    await this.awaitLock.acquireAsync();
    try {
      await this.initialize();
      return await fn();
    } finally {
      this.awaitLock.release();
    }
  }

  async query(sql, values) {
    return await this.lock(async function() {
      return await this._query(sql, values);
    }.bind(this));
  }

  async _query(sql, values) {
    values = this.normalizeValues(values);
    let result = await this.__query(sql, values);
    result = this.normalizeResult(result);
    return result;
  }

  async __query(sql, values) {
    // console.log(sql, JSON.stringify(values));
    return new Promise((resolve, reject) => {
      this.sqlite.query(sql, values, function(err, res) {
        if (err) reject(err); else resolve(res);
      });
    });
  }

  async transaction(fn) {
    return await this.lock(async function() {
      await this._query('BEGIN');
      try {
        let result = await fn({ query: this._query.bind(this) });
        await this._query('COMMIT');
        return result;
      } catch (err) {
        await this._query('ROLLBACK');
        throw err;
      }
    }.bind(this));
  }

  close() {
    return new Promise((resolve, reject) => {
      this.sqlite.close(function(err) {
        if (err) reject(err); else resolve();
      });
    });
  }

  normalizeValues(values) {
    if (values && values.length) {
      values = values.map(function(val) {
        if (typeof val === 'undefined') val = null;
        else if (Buffer.isBuffer(val)) val = 'bin!' + val.toString('hex');
        return val;
      });
    }
    return values;
  }

  normalizeResult(result) {
    if (!result) return result;
    let normalizedResult = [];
    if (result.affectedRows != null) {
      normalizedResult.affectedRows = result.affectedRows;
    }
    if (result.insertId != null) {
      normalizedResult.insertId = result.insertId;
    }
    if (!result.rows) return normalizedResult;
    for (let row of result.rows) {
      let normalizedRow = {};
      for (let key in row) {
        if (row.hasOwnProperty(key)) {
          let val = row[key];
          if (val && val.substr && val.substr(0, 4) === 'bin!') {
            val = new Buffer(val.substr(4), 'hex');
          }
          normalizedRow[key] = val;
        }
      }
      normalizedResult.push(normalizedRow);
    }
    return normalizedResult;
  }
}

export default AnySQLCordovaSQLite;
