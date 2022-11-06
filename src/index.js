'use strict';

const {createBluetooth} = require('node-ble');

const MqttBridge = require('./mqtt-bridge.js');
const SoundSend = require('./soundsend.js');

const {bluetooth} = createBluetooth();
let soundSend, mqttBridge;

async function handleCommand({key, value}) {
  try {
    switch (key) {
      case 'source':
        await soundSend.setAudioSource(value);
        break;
      case 'volume':
        await soundSend.setVolume(value);
        break;
      case 'audiomode':
        await soundSend.setAudioMode(value);
        break;
      default:
        throw new Error('Unknown command');
    }
  } catch (err) {
    console.log('Failed to execute command', {key, value}, err);
  }
}

async function start() {
  const bluetoothAdapter = await bluetooth.defaultAdapter();
  soundSend = new SoundSend(bluetoothAdapter, process.env.SOUNDSEND_ADDRESS);
  mqttBridge = new MqttBridge(process.env.MQTT_URI);

  soundSend.on('connected', () => mqttBridge.publishStatus('alive', 'true'));
  soundSend.on('disconnected', () => mqttBridge.publishStatus('alive', 'false'));
  soundSend.on('propertyChanged', ({key, value}) => {
    mqttBridge.publishStatus(key.toLowerCase(), value);
  });
  mqttBridge.on('commandReceived', handleCommand);

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
