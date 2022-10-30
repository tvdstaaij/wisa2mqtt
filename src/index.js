'use strict';

const {createBluetooth} = require('node-ble');
const SoundSend = require('./soundsend.js');

const {bluetooth} = createBluetooth();

async function main() {
  const bluetoothAdapter = await bluetooth.defaultAdapter();
  const soundSend = new SoundSend(bluetoothAdapter, process.env.SOUNDSEND_ADDRESS);
  soundSend.start();
}
main();
