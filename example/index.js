'use strict';

require('babel/polyfill');

let log = window.log = function(message) {
  let div = document.createElement('div');
  div.appendChild(document.createTextNode(message));
  document.body.appendChild(div);
};

log('SQLite Example');

window.addEventListener('error', function(err) {
  log(err.message);
}, false);

let co = require('co');
let wait = require('co-wait');
let KindaCordovaSQLite = require('../src');

let db = KindaCordovaSQLite.create({ name: 'example' });

co(function *() {
  log('=== Simple select ===');
  let result = yield db.query('SELECT ? + ? AS solution', [2, 3]);
  log(JSON.stringify(result));

  yield db.query('DROP TABLE IF EXISTS test');
  yield db.query('CREATE TABLE test (id INTEGER PRIMARY KEY, counter INTEGER)');
  result = yield db.query('INSERT INTO test (counter) VALUES (?)', [0]);
  let id = result.insertId;

  log('=== Completed transaction ===');
  yield db.transaction(function *(tr) {
    let res = yield tr.query('SELECT * FROM test WHERE id=?', [id]);
    log(JSON.stringify(res));
    let counter = res[0].counter;
    counter++;
    yield tr.query('UPDATE test SET counter=? WHERE id=?', [counter, id]);
    res = yield tr.query('SELECT * FROM test WHERE id=?', [id]);
    log(JSON.stringify(res));
  });
  result = yield db.query('SELECT * FROM test WHERE id=?', [id]);
  log(JSON.stringify(result));

  log('=== Aborted transaction ===');
  try {
    yield db.transaction(function *(tr) {
      let res = yield tr.query('SELECT * FROM test WHERE id=?', [id]);
      log(JSON.stringify(res));
      let counter = res[0].counter;
      counter++;
      yield tr.query('UPDATE test SET counter=? WHERE id=?', [counter, id]);
      res = yield tr.query('SELECT * FROM test WHERE id=?', [id]);
      log(JSON.stringify(res));
      throw new Error('something wrong!');
    });
  } catch (err) {
    log(err.message);
  }
  result = yield db.query('SELECT * FROM test WHERE id=?', [id]);
  log(JSON.stringify(result));

  log('=== Concurrent accesses ===');
  yield db.query('UPDATE test SET counter=? WHERE id=?', [0, id]);
  result = yield db.query('SELECT * FROM test WHERE id=?', [id]);
  log(JSON.stringify(result));
  for (let i = 0; i < 100; i++) {
    co(function *() {
      yield wait(Math.round(Math.random() * 1000));
      log(`i: ${i}`);
      yield db.transaction(function *(tr) {
        let res = yield tr.query('SELECT * FROM test WHERE id=?', [id]);
        let counter = res[0].counter;
        counter++;
        yield tr.query('UPDATE test SET counter=? WHERE id=?', [counter, id]);
        res = yield tr.query('SELECT * FROM test WHERE id=?', [id]);
        log(JSON.stringify(res));
      });
    }).catch(function(err) {
      log(err.message);
    });
  }
}).catch(function(err) {
  log(err.message);
});
