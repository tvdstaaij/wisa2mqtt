'use strict';

const SERIAL_SERVICE_UUID = '97ded94c-b564-48ab-ba96-7e1d2daa0edd';
const SERIAL_CHARACTERISTIC_UUID = 'a4a8d442-b8d0-404c-a0fb-f120115acf5e'

const MSG_TYPE_WRITE = 1;

const DATA_TYPE_VOLUME = 4;
const DATA_TYPE_AUDIO_MODE = 9;

class SoundSend {
  constructor(adapter, deviceAddress) {
    this._adapter = adapter;
    this._deviceAddress = deviceAddress;
    this._device = null;
    this._serialCharacteristic = null;
  }

  async start() {
    await this._attachDevice();
  }

  isConnected() {
    return !!this._device;
  }

  async setVolume(volumePercentage) {
    const data = [MSG_TYPE_WRITE, DATA_TYPE_VOLUME, 1, volumePercentage];
    return this._sendCommand(data);
  }

  async setAudioMode(mode) {
    const data = [MSG_TYPE_WRITE, DATA_TYPE_AUDIO_MODE, 1, mode];
    return this._sendCommand(data);
  }

  async _sendCommand(data) {
    if (this._device) {
      const buf = Buffer.from(data);
      const options = {type: 'command'};
      return this._serialCharacteristic.writeValue(buf, options);
    }
  }

  async _attachDevice() {
    try {
      console.log('Connecting to SoundSend');
      const isDiscovering = await this._adapter.isDiscovering();
      if (!isDiscovering) {
        await this._adapter.startDiscovery();
      }
      const device = await this._adapter.waitDevice(this._deviceAddress);

      device.once('disconnect', () => {
        console.log('Disconnected from SoundSend');
        this._device = null;
        this._serialCharacteristic = null;
        this._attachDevice();
      });

      await device.connect();
      const gattServer = await device.gatt();
      const serialService = await gattServer.getPrimaryService(SERIAL_SERVICE_UUID);
      this._serialCharacteristic = await serialService.getCharacteristic(SERIAL_CHARACTERISTIC_UUID);
      this._serialCharacteristic.on('valuechanged', (buf) => {
        console.log(new Date(), buf);
      })
      await this._serialCharacteristic.startNotifications();
      console.log('Connected to SoundSend');
      this._device = device;
    } catch (e) {
      if (e && e.type && e.type == 'org.bluez.Error.Failed') {
        console.log(`Connection failed (${e.text})`);
      } else {
        console.log('Unexpected connection error:', e);
      }
      setTimeout(() => this._attachDevice(), 5000);
    }
  }
}

module.exports = SoundSend;
