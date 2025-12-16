'use strict';

const {createBluetooth} = require('node-ble');

const MqttBridge = require('./mqtt-bridge.js');
const SoundSend = require('./soundsend.js');
const handleCommand = require('./command-handler.js');
const {retryPromise} = require('./utils.js');

const {bluetooth} = createBluetooth();

async function start() {
  if (!process.env.SOUNDSEND_ADDRESS) {
    throw Error('Environment variable SOUNDSEND_ADDRESS is not set');
  }

  let bluetoothAdapter = null;
  if (process.env.BLUETOOTH_ADAPTER) {
    console.log(`Using bluetooth adapter ${process.env.BLUETOOTH_ADAPTER}`);
    bluetoothAdapter = await bluetooth.getAdapter(process.env.BLUETOOTH_ADAPTER);
  } else {
    bluetoothAdapter = await bluetooth.defaultAdapter();
  }

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
        // Also force query the SoundSend settings so that they are immediately published.
        soundSend.readSettings();
      });
      mqttBridges.push(bridge);

      const connectionPromise = retryPromise(() => {
        return bridge.start().catch((err) => {
          console.log(`Failed to connect to MQTT broker ${name}:`, err);
          throw err;
        });
      }, 1000, 60000);
      mqttConnectionPromises.push(connectionPromise);
    }
  }

  if (!mqttConnectionPromises.length) {
    throw Error('Environment variable MQTT_URI is not set');
  }

  try {
    await Promise.race([
      Promise.any(mqttConnectionPromises),
      new Promise((resolve, reject) => setTimeout(reject, 10000)),
    ]);
  } catch (err) {
    throw Error('Could not connect to any broker within 10 seconds');
  }

  // Wait until connected to all brokers if possible, but move on if this
  // doesn't happen within 10 seconds.
  await Promise.race([
    Promise.all(mqttConnectionPromises),
    new Promise((resolve) => setTimeout(resolve, 10000)),
  ]);

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
  soundSend.on('propertyChanged', ({key, value}) => {
    console.log(`propertyChanged: ${key} => ${value}`);
    mqttBridges.forEach((bridge) => {
      bridge.publishStatus(key.toLowerCase(), value);
    });
  });
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
