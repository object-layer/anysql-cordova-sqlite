'use strict';

let log = window.log = function(message) {
  let div = document.createElement('div');
  div.appendChild(document.createTextNode(message));
  document.body.appendChild(div);
};

log('SQLite Example');

window.addEventListener('error', function(err) {
  log(err.message);
}, false);

import sleep from 'sleep-promise';
import AnySQLCordovaSQLite from '../src';

let db = new AnySQLCordovaSQLite('cordova-sqlite:example');

(async function() {
  log('=== Simple select ===');
  let result = await db.query('SELECT ? + ? AS solution', [2, 3]);
  log(JSON.stringify(result));

  await db.query('DROP TABLE IF EXISTS test');
  await db.query('CREATE TABLE test (id INTEGER PRIMARY KEY, counter INTEGER)');
  result = await db.query('INSERT INTO test (counter) VALUES (?)', [0]);
  let id = result.insertId;

  log('=== Completed transaction ===');
  await db.transaction(async function(tr) {
    let res = await tr.query('SELECT * FROM test WHERE id=?', [id]);
    log(JSON.stringify(res));
    let counter = res[0].counter;
    counter++;
    await tr.query('UPDATE test SET counter=? WHERE id=?', [counter, id]);
    res = await tr.query('SELECT * FROM test WHERE id=?', [id]);
    log(JSON.stringify(res));
  });
  result = await db.query('SELECT * FROM test WHERE id=?', [id]);
  log(JSON.stringify(result));

  log('=== Aborted transaction ===');
  try {
    await db.transaction(async function(tr) {
      let res = await tr.query('SELECT * FROM test WHERE id=?', [id]);
      log(JSON.stringify(res));
      let counter = res[0].counter;
      counter++;
      await tr.query('UPDATE test SET counter=? WHERE id=?', [counter, id]);
      res = await tr.query('SELECT * FROM test WHERE id=?', [id]);
      log(JSON.stringify(res));
      throw new Error('something wrong!');
    });
  } catch (err) {
    log(err.message);
  }
  result = await db.query('SELECT * FROM test WHERE id=?', [id]);
  log(JSON.stringify(result));

  log('=== Concurrent accesses ===');
  await db.query('UPDATE test SET counter=? WHERE id=?', [0, id]);
  result = await db.query('SELECT * FROM test WHERE id=?', [id]);
  log(JSON.stringify(result));
  for (let i = 0; i < 100; i++) {
    (async function() {
      await sleep(Math.round(Math.random() * 1000));
      log(`i: ${i}`);
      await db.transaction(async function(tr) {
        let res = await tr.query('SELECT * FROM test WHERE id=?', [id]);
        let counter = res[0].counter;
        counter++;
        await tr.query('UPDATE test SET counter=? WHERE id=?', [counter, id]);
        res = await tr.query('SELECT * FROM test WHERE id=?', [id]);
        log(JSON.stringify(res));
      });
    })().catch(function(err) {
      log(err.message);
    });
  }
})().catch(function(err) {
  log(err.message);
});
