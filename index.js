#!/usr/bin/env node
require('dotenv').config()

const util = require('util');
const spawn = require('child_process').spawn;
const yargs = require('yargs');
const smartthings = require("smartthings-node");
const throttle = require('lodash').throttle;

let tempReadings = [];

const {
    color: TILT_COLOR,
    temp: TARGET_TEMP,
    accessKey: ACCESS_KEY,
    deviceId: DEVICE_ID,
} = yargs
    .env("TT")
    .command('tilt-thermostat', 'Controls IoT device by Tilt temperature', {
        color: {
            description: 'Set tilt color',
            type: 'string',
        },
        temp: {
            description: 'Set target temperature',
            type: 'number',
        },
        accessKey: {
            type: 'string'
        },
        deviceId: {
            type: 'string'
        }
    })
    .help()
    .alias('help', 'h')
        .argv;

let st = new smartthings.SmartThings(ACCESS_KEY);

const BEACON_IDS = {
    "Red": "a495bb10c5b14b44b5121370f02d74de",
    "Green": "a495bb20c5b14b44b5121370f02d74de",
    "Black": "a495bb30c5b14b44b5121370f02d74de",
    "Purple": "a495bb40c5b14b44b5121370f02d74de",
    "Orange": "a495bb50c5b14b44b5121370f02d74de",
    "Blue": "a495bb60c5b14b44b5121370f02d74de",
    "Pink": "a495bb70c5b14b44b5121370f02d74de",
};

const THROTTLE_WAIT = 1000 * 60 * 15;
const TARGET_DEVIATION = 0.5;

const beaconId = BEACON_IDS[TILT_COLOR];

if (!beaconId) {
    console.error("Cannot find beacon ID");
    process.exit(1);
}

console.log("Looking for beacon ID", beaconId);

async function runScan() {
    const process = spawn('python3', ['-u', '-m', 'aioblescan', '-T']);

    process.stdout.on('data', (data) => {
        if (data) {
            try {
                const { uuid, major: tempF, minor: gravity } = JSON.parse(data);
                const tempC = fToC(tempF);
                const avgTemp = getRollingAverage(tempC);

                console.log(`Temp: ${tempC}, Rolling Avg: ${avgTemp}, Target: ${TARGET_TEMP}`);

                if (avgTemp < TARGET_TEMP - TARGET_DEVIATION) {
                    heatOn();
                } else if (avgTemp > TARGET_TEMP + TARGET_DEVIATION) {
                    heatOff();
                }
            } catch (err) {
                // console.warn(err);
            }
        }
    });
}

const fToC = (f) => (f - 32) / 1.8;

const getRollingAverage = (temp) => {
    const ROLLING_RANGE = 20;
    tempReadings.push(temp);

    if (tempReadings.length > ROLLING_RANGE) {
        tempReadings = tempReadings.slice(tempReadings.length - ROLLING_RANGE);
    }

    return tempReadings.reduce((sum, temp) => sum + temp, 0) / tempReadings.length;
}

const heatOn = throttle(() => {
    console.log("HEAT ON");

    const commands = [
        {
            command: 'on',
            capability: 'switch',
            component: 'main',
            arguments: []
        }
    ];

    st.devices.executeDeviceCommand(DEVICE_ID, commands)
}, THROTTLE_WAIT);

const heatOff = throttle(() => {
    console.log("HEAT OFF");

    const commands = [
        {
            command: 'off',
            capability: 'switch',
            component: 'main',
            arguments: []
        }
    ];

    st.devices.executeDeviceCommand(DEVICE_ID, commands)
}, THROTTLE_WAIT);

runScan();