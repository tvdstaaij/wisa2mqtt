'use strict';

const {createBluetooth} = require('node-ble');

const MqttBridge = require('./mqtt-bridge.js');
const SoundSend = require('./soundsend.js');
const handleCommand = require('./command-handler.js');

const {bluetooth} = createBluetooth();

async function start() {
  const bluetoothAdapter = await bluetooth.defaultAdapter();
  const soundSend = new SoundSend(bluetoothAdapter, process.env.SOUNDSEND_ADDRESS);

  const mqttBridges = [];
  const mqttConnectionPromises = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('MQTT_URI')) {
      let name = key.substring(8);
      if (name.startsWith('_')) {
        name = name.substring(1);
      }
      let bridge = new MqttBridge(name, value);
      bridge.on('commandReceived', ({command, arg}) => {
        handleCommand(soundSend, command, arg);
      });
      bridge.on('connected', () => {
        // While disconnected from MQTT, the Last Will and Testament will have been
        // published, so observers will think the device is not alive. Therefore,
        // always re-publish the device status after (re)connecting to MQTT.
        bridge.publishStatus('alive', soundSend.connected);
      });
      mqttBridges.push(bridge);
      mqttConnectionPromises.push(bridge.start());
    }
  }
  await Promise.all(mqttConnectionPromises);

  soundSend.on('connecting', ({attempt}) => {
    if (attempt > 3) {
      console.log('SoundSend connection attempts exhausted');
      process.exit(1);
    }
  });
  soundSend.on('connected', () => mqttBridges.forEach((bridge) => {
    bridge.publishStatus('alive', true);
  }));
  soundSend.on('disconnected', () => mqttBridges.forEach((bridge) => {
    bridge.publishStatus('alive', false);
  }));
  soundSend.on('propertyChanged', ({key, value}) => mqttBridges.forEach((bridge) => {
    bridge.publishStatus(key.toLowerCase(), value);
  }));
  await soundSend.start();

  setInterval(() => soundSend.queryAudioFormat(), 5000);
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
