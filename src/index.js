'use strict';

let _ = require('lodash');
let co = require('co');
let KindaObject = require('kinda-object');

let KindaCordovaSQLite = KindaObject.extend('KindaCordovaSQLite', function() {
  this.setCreator(function(options = {}) {
    if (!options.name) throw new Error('Cordova SQLite database name is missing');
    let that = this;
    document.addEventListener('deviceready', function() {
      that.database = window.sqlitePlugin.openDatabase({
        name: options.name,
        location: 2
      });
    }, false);
  });

  this.initialize = function(cb) {
    let that = this;
    let timestamp = Date.now();
    let check = function() {
      if (that.database) {
        cb();
        return;
      }
      if (Date.now() - timestamp > 5000) {
        cb(new Error('initialization of KindaCordovaSQLite failed (Cordova didn\'t start after 5 seconds)'));
        return;
      }
      setTimeout(check, 200);
    };
    check();
  };

  this.query = function(sql, values) {
    let that = this;
    values = that.normalizeValues(values);
    let result;
    return function(cb) {
      that.initialize(function(err) {
        if (err) {
          cb(err);
          return;
        }
        that.database.transaction(function(tr) {
          tr.executeSql(sql, values, function(innerTr, res) {
            result = that.normalizeResult(res);
          });
        }, function(innerErr) { // transaction error callback
          cb(innerErr);
        }, function() { // transaction success callback
          cb(null, result);
        });
      });
    };
  };

  this.transaction = function(fn) {
    let that = this;
    return function(cb) {
      that.initialize(function(err) {
        if (err) {
          cb(err);
          return;
        }
        let lastErr;
        let transactionAborted;
        that.database.transaction(function(tr) {
          co(function *() {
            try {
              yield fn({
                query(sql, values) {
                  values = that.normalizeValues(values);
                  return function(innerCb) {
                    try {
                      tr.executeSql(sql, values, function(innerTr, res) {
                        innerCb(null, that.normalizeResult(res));
                      }, function(innerTr, innerErr) {
                        transactionAborted = true;
                        innerCb(innerErr);
                        return true;
                      });
                    } catch (innerErr) {
                      cb(innerErr);
                    }
                  };
                }
              });
            } catch (innerErr) {
              lastErr = innerErr;
              if (!transactionAborted) {
                transactionAborted = true;
                tr.executeSql('arghhhh'); // force the transaction to fail
              }
            }
          })();
        }, function(innerErr) { // transaction error callback
          cb(lastErr || innerErr);
        }, function() { // transaction success callback
          cb(null);
        });
      });
    };
  };

  this.normalizeValues = function(values) {
    if (values && values.length) {
      values = _.map(values, function(val) {
        if (typeof val === 'undefined') val = null;
        else if (Buffer.isBuffer(val)) val = 'bin!' + val.toString('hex');
        return val;
      });
    }
    return values;
  };

  this.normalizeResult = function(result) {
    if (!result) return result;
    let normalizedResult = [];
    if (result.rowsAffected != null) {
      normalizedResult.affectedRows = result.rowsAffected;
    }
    try {
      if (result.insertId != null) {
        normalizedResult.insertId = result.insertId;
      }
    } catch (err) {
      // noop
    }
    if (!result.rows) return normalizedResult;
    for (let i = 0; i < result.rows.length; i++) {
      let row = result.rows.item(i);
      let normalizedRow = {};
      _.forOwn(row, function(val, key) { // eslint-disable-line no-loop-func
        if (val && val.substr && val.substr(0, 4) === 'bin!') {
          val = new Buffer(val.substr(4), 'hex');
        }
        normalizedRow[key] = val;
      });
      normalizedResult.push(normalizedRow);
    }
    return normalizedResult;
  };
});

module.exports = KindaCordovaSQLite;
