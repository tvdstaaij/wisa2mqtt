'use strict';

const {createBluetooth} = require('node-ble');

const MqttBridge = require('./mqtt-bridge.js');
const SoundSend = require('./soundsend.js');
const handleCommand = require('./command-handler.js');

const {bluetooth} = createBluetooth();
let soundSend, mqttBridge;

async function start() {
  const bluetoothAdapter = await bluetooth.defaultAdapter();
  soundSend = new SoundSend(bluetoothAdapter, process.env.SOUNDSEND_ADDRESS);
  mqttBridge = new MqttBridge(process.env.MQTT_URI);

  soundSend.on('connecting', ({attempts}) => {
    if (attempts > 3) {
      console.log('SoundSend connection attempts exhausted');
      process.exit(1);
    }
  });
  soundSend.on('connected', () => mqttBridge.publishStatus('alive', 'true'));
  soundSend.on('disconnected', () => mqttBridge.publishStatus('alive', 'false'));
  soundSend.on('propertyChanged', ({key, value}) => {
    mqttBridge.publishStatus(key.toLowerCase(), value);
  });
  mqttBridge.on('commandReceived', ({command, arg}) => {
    handleCommand(soundSend, command, arg);
  });

  await mqttBridge.start();
  await soundSend.start();
}

async function main() {
  try {
    await start();
  } catch (err) {
    console.log('Fatal error during startup:', err);
    process.exit(1);
  }
}
main();
