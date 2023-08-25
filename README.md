# wisa2mqtt: WiSA SoundSend MQTT bridge

The WiSA SoundSend wireless audio transmitter comes with an official smartphone
app to control its settings through Bluetooth Low Energy.

Do you own a SoundSend and do you feel limited by the official app?
Want to integrate your SoundSend with external systems and devices such as
Home Assistant or infrared control? Then you might like wisa2mqtt.

wisa2mqtt maintains a persistent BLE connection with a SoundSend device, and
exposes its most important settings through MQTT.

Bonus benefit: because the SoundSend only supports a single (insecure) BLE
connection and wisa2mqtt keeps it occupied, it prevents your neighbors from
easily taking control of your SoundSend.

## Setup

Install dependencies using npm or a compatible utility.

Set the following environment variables:

* `MQTT_URI`: Connection string for your MQTT broker, for example
  `mqtts://user:pass@mybroker.org`.
* `SOUNDSEND_ADDRESS`: BLE device address of your SoundSend in
  `AA:BB:CC:DD:EE:FF` notation. Find this using a BLE scanning app.

Then, simply run `node .` in this directory.

## MQTT interface

wisa2mqtt publishes on the topic prefix `wisa2mqtt/status/+` and subscribes
to the prefix `wisa2mqtt/command/+`.

### Status topics

* `alive`: `true` when SoundSend connection is established, `false`
  when SoundSend/MQTT connection is lost or when wisa2mqtt exits. Note that
  wisa2mqtt will automatically attempt to reconnect in case of connection loss.
* `volume`: current volume level, range 0-100.
* `audiomode`: current DSP mode setting, either
  `direct`, `movie`, `music` or `night`.
* `audiosource`: current audio source setting, either `arc` or `optical`.
* `audioformat`: audio codec detected by the SoundSend, either `none`, `pcm`,
  `ac3`, `eac3`, `truehd` or `atmos`. Update interval is can vary in practice,
  but should be at least a couple of times per minute.

### Command topics

* `setsource`: set the audio source to `arc` or `optical`.
* `nextsource`: cycle to the next available audio source.
* `setvolume`: set volume to the given level (0-100).
* `volumeup`: increase volume by the given amount (clipping at 100).
* `volumedown`: decrease volume by the given amount (clipping at 0).
* `setaudiomode`: set DSP mode to `direct`, `movie`, `music` or `night`.
* `nextsource`: cycle to the next available DSP mode.
* `mute`: set volume to 0 until unmuted.
* `unmute`: restore volume to the original level before muting.
* `togglemute`: mute if unmuted, unmute if muted.

## Example systemd service

You could run wisa2mqtt as a systemd service, for example:

```
[Unit]
Description=WiSA SoundSend MQTT bridge
Wants=network-online.target bluetooth.target
After=network-online.target bluetooth.target

[Service]
Type=simple
EnvironmentFile=/etc/wisa2mqtt.env # Put required env vars in this file
ExecStart=/usr/bin/node /path/to/wisa2mqtt
User=wisa2mqtt
WorkingDirectory=/path/to/wisa2mqtt
StandardOutput=journal
StandardError=journal
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Disclaimer

WiSA® is a trademark of WiSA, LLC.

This software is a hobby project. The author is not affiliated in any way with
WiSA, LLC., WiSA Technologies, Inc., or the WiSA Association.
