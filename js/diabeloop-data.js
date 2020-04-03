/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 *
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

/* global __DEV__ */

/**
 * @typedef {{ id: string, normalTime: string, timezone: string, [x: string]: any }} CommonDatum
 * @typedef {{ id: string, timestamps: number, timezone: string, value: number}} DailyDatum
 * @typedef {{ id: string, timestamps: number, timezone: string, value: number, expectedValue: number}} BolusDailyDatum
 */

// Global imports
import _ from 'lodash';
import moment from 'moment-timezone';
import bows from 'bows';
import crossfilter from 'crossfilter2';
import PropTypes from 'prop-types';
// Local imports
import dt from './data/util/datetime';
import validate from './validation/validate';
import {
  MS_IN_DAY,
  MGDL_UNITS,
  MMOLL_UNITS,
  MGDL_PER_MMOLL,
  DEFAULT_BG_BOUNDS,
  BG_CLAMP_THRESHOLD,
  DEVICE_PARAMS_OFFSET,
} from './data/util/constants';
// import BasalUtil from './data/basalutil';
// import BolusUtil from './data/bolusutil';
// import BGUtil from './data/bgutil';


const defaultOptions = {
  timePrefs: {
    timezoneAware: true,
    timezoneName: 'UTC'
  },
  CBG_PERCENT_FOR_ENOUGH: 0.75,
  CBG_MAX_DAILY: 288,
  SMBG_DAILY_MIN: 4,
  basicsTypes: ['basal', 'bolus', 'cbg', 'smbg', 'deviceEvent', 'wizard', 'upload'],
  bgUnits: MGDL_UNITS,
  bgClasses: {
    'very-low': { boundary: DEFAULT_BG_BOUNDS[MGDL_UNITS].veryLow },
    low: { boundary: DEFAULT_BG_BOUNDS[MGDL_UNITS].targetLower },
    target: { boundary: DEFAULT_BG_BOUNDS[MGDL_UNITS].targetUpper },
    high: { boundary: DEFAULT_BG_BOUNDS[MGDL_UNITS].veryHigh },
    'very-high': { boundary: BG_CLAMP_THRESHOLD[MGDL_UNITS] },
  },
  fillOpts: {
    /** CSS classes */
    classes: {
      0: 'darkest',
      3: 'dark',
      6: 'lighter',
      9: 'light',
      12: 'lightest',
      15: 'lighter',
      18: 'dark',
      21: 'darker',
    },
    /** In hours */
    duration: 3,
  },
  diabetesDataTypes: [
    'basal',
    'bolus',
    'cbg',
    'smbg',
    'wizard',
  ],
};

// @ts-ignore
const isDev = typeof __DEV__ === 'boolean' ? __DEV__ : false;
const startTimer = isDev ? (name) => { console.time(name); } : _.noop; // eslint-disable-line no-console, max-len
const endTimer = isDev ? (name) => { console.timeEnd(name); } : _.noop; // eslint-disable-line no-console, max-len

class DiabeloopData {
  constructor(data, options) {
    // Merge options & default options
    if (isDev) {
      this.log = bows('DiabeloopData');
      this.log.info('constructor()', options);
    } else {
      this.log = _.noop;
    }

    this.timePrefs = defaultOptions.timePrefs;
    /** @type{defaultOptions} */
    this.opts = defaultOptions;
    if (typeof options === 'object' && options !== null) {
      this.opts = options;
      _.defaultsDeep(this.opts, defaultOptions);
    }

    if (this.opts.bgUnits !== defaultOptions.bgUnits) {
      this.opts.bgClasses = {
        'very-low': { boundary: DEFAULT_BG_BOUNDS[this.opts.bgUnits].veryLow },
        low: { boundary: DEFAULT_BG_BOUNDS[this.opts.bgUnits].targetLower },
        target: { boundary: DEFAULT_BG_BOUNDS[this.opts.bgUnits].targetUpper },
        high: { boundary: DEFAULT_BG_BOUNDS[this.opts.bgUnits].veryHigh },
        'very-high': { boundary: BG_CLAMP_THRESHOLD[this.opts.bgUnits] },
      };
    }

    if (!Array.isArray(data)) {
      throw new Error('Invalid parameter data');
    }

    this.rawData = [];
    this.reset();

    if (data.length > 0) {
      this.addData(data);
    } else {
      this.log.info('No new data to add');
    }

    this.isDiabeloopData = true;
  }

  reset() {
    this.timePrefs = this.opts.timePrefs;
    this.endpoints = null;
    /** @type {CommonDatum[]} Almost all data from platform-data */
    this.data = [];
    /** Contains array with this.data grouped by type */
    this.grouped = {
      fill: [],
      upload: [],
      deviceEvent: [],
      cbg: [],
      smbg: [],
    };
    /** @type {CommonDatum[]} Almost like this.data, but with fewer elements */
    this.diabetesData = [];
    /** Diabeloop device parameters grouped for displaying in the daily view */
    this.deviceParameters = [];
    this.bgUnits = this.opts.bgUnits;
    this.bgClasses = this.opts.bgClasses;
    this.basicsData = {
      /** Timezone of the latest data */
      timezone: 'UTC',
      /** @type{string[]} Date range of the basics data: 2 ISO-8601 strings */
      dateRange: [],
      /** @type{{type: string, date: string}[]} List of days past, present, future */
      days: [],
      /** Almost the same as this.grouped */
      data: {
        reservoirChange: {
          /** @type CommonDatum[] */
          data: [],
          /** @type{Map<string, Array<CommonDatum>>} 'YYYY-MM-DD' -> [{deviceEvent datum}] */
          byDate: new Map(),
        },
        cannulaPrime: { data: [] },
        tubingPrime: { data: [] },
        calibration: { data: [] },
        upload: { data: [] },
        basal: {
          data: [],
          /** @type{Map<string, Array<object>>} 'YYYY-MM-DD' -> [{basal datum}] */
          byDate: new Map(),
        },
        bolus: {
          /** All data of type bolus & wizard */
          data: [],
          /** @type{Map<string, Array<object>>} 'YYYY-MM-DD' -> [{bolus datum}] */
          byDate: new Map(),
          avgPerDay: 0,
          nManual: 0,
          nAutomated: 0,
          nInterrupted: 0,
        },
        cbg: { data: [] },
        smbg: { data: [] },
        wizard: { data: [] },
      },
    };
    this.dailyData = {
      /** Used to scale the values in the daily chart */
      cbgMax: Number.NEGATIVE_INFINITY,
      /** Used to scale the values in the daily chart */
      bolusMax: Number.NEGATIVE_INFINITY,
      /** @type {DailyDatum[]} Blood glucose */
      cbg: [],
      cbgByTimestamps: null,
      /** @type {BolusDailyDatum[]} */
      bolus: [],
      bolusByTimestamps: null,
      /** @type {DailyDatum[]} Carbohydrates */
      wizard: [],
      wizardByTimestamps: null,
      /** @type {DailyDatum[]} Rescue carbs */
      food: [],
      foodByTimestamps: null,
    };
    // Utilities:
    this.basalUtil = null;
    this.bolusUtil = null;
    this.cbgUtil = null;
    this.smbgUtil = null;
    // Crossfilters
    this.dataByDate = null;
    this.dataById = null;
    this.smbgByDate = null;
    this.smbgByDayOfWeek = null;
    this.cbgByDate = null;
    this.cbgByDayOfWeek = null;
  }

  addData(newData = []) {
    if (!Array.isArray(newData) || newData.length < 1) {
      return;
    }
    startTimer('addData');

    // To keep theses new data:
    if (this.rawData.length < 1) {
      this.rawData = newData;
    } else {
      Array.prototype.push.apply(this.rawData, newData);
    }

    this.sortByTime(this.rawData);
    this.reset();

    // To avoid duplicate data:
    const ids = new Map();
    const duplicates = [];
    const invalids = [];
    let firstEndPoint = '9999-99-99T00:00:00.000Z';
    let lastEndPoint = '0000-00-00T00:00:00.000Z';

    // Init data, diabetesDataTypes and grouped{} arrays
    startTimer('addDataArrays');
    const nData = this.rawData.length;
    let timezone = null;
    for (let i = 0; i < nData; i++) {
      /** @type {CommonDatum} */
      const datum = this.rawData[i];
      const ok = this.normalizeDatum(datum);

      if (typeof datum.errorMessage === 'string') {
        // Already flagged as invalid
        invalids.push(datum);
        continue;
      }

      if (datum.type === 'basal' && datum.deliveryType === 'temp') {
        // Ignore temp basal
        continue;
      }

      if (ids.has(datum.id)) {
        // Ignoring duplicate
        duplicates.push(datum);
        continue;
      }
      // Insert the datum to the map, to check for duplicate entries
      ids.set(datum.id, datum);

      if (ok && validate.validateOneRet(datum)) {
        const { type } = datum;
        // Add data to its group
        const group = _.get(this.grouped, type, []);
        group.push(datum);
        Object.defineProperty(this.grouped, type, { value: group, enumerable: true });

        // For diabetes data type:
        if (this.opts.diabetesDataTypes.includes(type)) {
          this.diabetesData.push(datum);
          if (datum.normalTime < firstEndPoint) firstEndPoint = datum.normalTime;
          if (typeof datum.normalEnd === 'string' && datum.normalEnd > lastEndPoint) {
            lastEndPoint = datum.normalEnd;
          } else if (datum.normalTime > lastEndPoint) {
            lastEndPoint = datum.normalTime;
          }
        }

        if (type !== 'upload') {
          this.data.push(datum);
        }
        this.updateDailyData(datum);

        // Timezone change:
        if (timezone === null) {
          timezone = datum.timezone;
        } else if (timezone !== datum.timezone && datum.timezone !== 'UTC') {
          if (datum.type === 'deviceEvent' && datum.subType === 'timeChange') {
            // No need to add one
            timezone = datum.timezone;
          } else {
            // Insert a timezone change object
            const prevTime = moment.tz(datum.normalTime, timezone).format('YYYY-MM-DDTHH:mm:ss');
            const newTime = moment.tz(datum.normalTime, datum.timezone).format('YYYY-MM-DDTHH:mm:ss');
            const datumTimezoneChange = {
              id: DiabeloopData.genRandomId(),
              time: datum.normalTime,
              normalTime: datum.normalTime,
              timezone: datum.timezone,
              timezoneOffset: datum.timezoneOffset,
              type: 'deviceEvent',
              subType: 'timeChange',
              source: 'Diabeloop',
              from: {
                time: prevTime,
                timeZoneName: timezone,
              },
              to: {
                time: newTime,
                timeZoneName: datum.timezone,
              },
              method: 'automatic',
            };
            timezone = datum.timezone;

            if (!validate.validateOneRet(datumTimezoneChange)) {
              this.log.error(datumTimezoneChange);
            } else {
              this.log.info('Timezone change detected', datumTimezoneChange.from, datumTimezoneChange.to);
              this.data.push(datumTimezoneChange);
              this.grouped.deviceEvent.push(datumTimezoneChange);
            }
          }
        }
      } else {
        invalids.push(datum);
      }
    }

    // Sort the data arrays
    this.sortByNormalTime(this.data);
    this.sortByNormalTime(this.diabetesData);
    this.sortByTimestamps(this.dailyData.cbg);
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const group in this.grouped) {
      this.sortByNormalTime(this.grouped[group]);
    }
    this.endpoints = [firstEndPoint, lastEndPoint];
    endTimer('addDataArrays');

    this.log.info(`Number of data: ${this.data.length}`);
    this.log.info(`Number of diabetes data: ${this.diabetesData.length}`);
    this.log.info(`Number of duplicate entries: ${duplicates.length}`);
    this.log.info(`Number of invalid entries: ${invalids.length}`);
    if (duplicates.length > 0) {
      this.log.debug('duplicates:', duplicates);
    }
    if (invalids.length > 0) {
      this.log.debug('invalids:', invalids);
    }

    this.filterDataArray();
    this.initDailyFillData();
    this.initDeviceParameters();
    // this.initUtilities(); // Not used
    this.initCrossFilters();
    this.initBasicsData();

    if (timezone !== null) {
      this.timePrefs.timezoneName = timezone;
      this.opts.timePrefs.timezoneName = timezone;
    }

    endTimer('addData');

    this.log.debug(this);
  }

  static genRandomId() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    const hexID = new Array(16);
    for (let i = 0; i < array.length; i++) {
      const b = array[i];
      const hex = (b + 0x100).toString(16).substr(1);
      hexID[i] = hex;
    }
    return hexID.join('');
  }

  /**
   * Sort the array by time
   * @param {Array} array The array to sort.
   */
  sortByTime(array) {
    if (Array.isArray(array)) {
      array.sort((a, b) => {
        if (typeof a !== 'object' || a === null) return -1;
        if (typeof b !== 'object' || b === null) return 1;
        if (typeof a.time !== 'string') return -1;
        if (typeof b.time !== 'string') return 1;
        if (a.time < b.time) return -1;
        if (a.time > b.time) return 1;
        return 0;
      });
    } else {
      this.log.error('sortByTime: Invalid parameter', array);
    }
  }

  /**
   * Sort the array by normalTime.
   * @param {Array} array The array to sort.
   */
  sortByNormalTime(array) {
    if (Array.isArray(array)) {
      array.sort((a, b) => {
        if (a.normalTime < b.normalTime) return -1;
        if (a.normalTime > b.normalTime) return 1;
        return 0;
      });
    } else {
      this.log.error('sortByNormalTime: Invalid parameter', array);
    }
  }

  /**
   * Sort the array by timestamps.
   * @param {Array} array The array to sort.
   */
  sortByTimestamps(array) {
    if (Array.isArray(array)) {
      array.sort((a, b) => {
        if (a.timestamps < b.timestamps) return -1;
        if (a.timestamps > b.timestamps) return 1;
        return 0;
      });
    } else {
      this.log.error('sortByTimestamps: Invalid parameter', array);
    }
  }

  /**
   * Remove unwanted datum in the main array
   */
  filterDataArray() {
    startTimer('filterData');
    if (this.diabetesData.length > 0) {
      const firstDDTime = this.diabetesData[0].normalTime;
      const lastDDTime = this.diabetesData[this.diabetesData.length - 1].normalTime;
      this.data = _.reject(this.data, (d) => {
        if (d.type === 'message' && d.normalTime < firstDDTime) {
          return true;
        }
        if (d.type === 'pumpSettings' && (d.normalTime < firstDDTime || d.normalTime > lastDDTime)) {
          return true;
        }
        if (d.type === 'upload') {
          return true;
        }
        return false;
      });
    }
    endTimer('filterData');
  }

  translateBg(value) {
    if (this.bgUnits === MMOLL_UNITS) {
      return value / MGDL_PER_MMOLL;
    } else {
      return MGDL_PER_MMOLL * value;
    }
  }

  normalizeDatum(d) {
    /* eslint-disable no-param-reassign */
    if (typeof d !== 'object' || d === null) {
      this.log.error('normalizeDatum: Invalid datum', d);
      return false;
    }

    if (typeof d.normalTime === 'string') {
      // Already done
      return true;
    }

    // Messages are differents from the rests of the data, it needs a special attention
    if (typeof d.messagetext === 'string' && d.type !== 'message') {
      d.type = 'message';
      d.time = moment.utc(d.timestamp).toISOString();
      d.parentMessage = d.parentmessage;
      delete d.parentmessage;
      delete d.timestamp;
    }

    if (typeof d.id !== 'string' || /^[A-Za-z0-9\-\_]+$/.test(d.id) === false) {
      // Generate a fake id
      d.id = DiabeloopData.genRandomId();
      this.log.debug(`Datum ${d.type} missing id, generated: ${d.id}`);
    }

    if (typeof d.time !== 'string') {
      // Missing time info
      d.errorMessage = 'Missing time';
      return false;
    }

    const mTime = moment.utc(d.time);
    if (!mTime.isValid()) {
      this.log.error('Invalid time', d);
      return false;
    }

    if (typeof d.timezone !== 'string' || d.timezone === '') {
      // Be sure to have a timezone
      d.timezone = 'UTC';
    }

    d.displayOffset = 0;
    d.source = 'Diabeloop';
    // Normal time, should always be the same than "time".
    d.normalTime = mTime.toISOString();

    // Local time specific
    let mLocalTime = mTime;
    if (typeof d.timezone === 'string') {
      mLocalTime = moment.tz(mTime, d.timezone);
      if (mLocalTime.isValid()) {
        d.displayOffset = -mLocalTime.utcOffset();
      } else { // Invalid timezone
        d.timezone = 'UTC';
        mLocalTime = mTime;
      }
    }

    // Update units & other infos
    switch (d.type) {
    case 'basal':
      d.normalEnd = moment(mTime).add(d.duration, 'ms').toISOString();
      break;
    case 'cbg':
    case 'smbg':
      if (d.units !== this.bgUnits) {
        d.units = this.bgUnits;
        d.value = this.translateBg(d.value);
      }
      d.localDayOfWeek = dt.weekdayLookup(mLocalTime.days());
      d.localDate = mLocalTime.format('YYYY-MM-DD');
      // msPer24 use in viz for trends page
      d.msPer24 = mLocalTime.diff(moment(mLocalTime).startOf('day'), 'milliseconds', false);
      break;
    case 'wizard':
      if (d.units !== this.bgUnits) {
        d.units = this.bgUnits;
        if (d.bgInput) {
          d.bgInput = this.translateBg(d.bgInput);
        }
      }
      break;
    }

    return true;
    /* eslint-enable no-param-reassign */
  }

  /**
   * @param {CommonDatum} d The datum
   */
  updateDailyData(d) {
    const { type } = d;
    const { id, timezone } = d;
    const timestamps = Date.parse(d.normalTime);

    switch (type) {
    case 'cbg':
      {
        /** @type {number} */
        const value = d.value;
        this.dailyData.cbg.push({
          id,
          timestamps,
          timezone,
          value,
        });
        if (value > this.dailyData.cbgMax) {
          this.dailyData.cbgMax = value;
        }
      }
      break;
    case 'bolus':
      {
        const value = d.normal;
        const expectedValue = d.expectedNormal;
        const maxValue = Math.max(value, expectedValue);
        this.dailyData.bolus.push({
          id,
          timestamps,
          timezone,
          value,
          expectedValue
        });
        if (maxValue > this.dailyData.bolusMax) {
          this.dailyData.bolusMax = maxValue;
        }
      }
      break;
    case 'wizard':
      {
        const value = d.carbInput;
        this.dailyData.wizard.push({
          id,
          timestamps,
          timezone,
          value,
        });
      }
      break;
    case 'food':
      {
        if (d.meal === 'rescuecarbs') {
          const value = d.nutrition.carbohydrate.net;
          this.dailyData.food.push({
            id,
            timestamps,
            timezone,
            value,
          });
        } else {
          this.log.error('Missing food meal type', d.meal, d);
        }
      }
      break;
    }
  }

  /**
   * Used to display the device parameters (type: 'deviceEvent', subType: 'deviceParameter')
   * in the daily view.
   */
  initDeviceParameters() {
    this.deviceParameters = [];
    const deviceEvent = _.get(this, 'grouped.deviceEvent', []);
    if (!Array.isArray(deviceEvent)) {
      throw new Error('Invalid deviceEvent type');
    }
    startTimer('initDeviceParameters');
    const parameters = _.filter(deviceEvent, { subType: 'deviceParameter' });
    if (parameters.length > 0) {
      const first = parameters[0];
      let group = {
        normalTime: first.normalTime,
        id: first.id,
        params: [first],
      };
      let groupMoment = moment.tz(first.normalTime, first.timezone);
      for (let i = 1; i < parameters.length; ++i) {
        const item = parameters[i];
        const itemMoment = moment.tz(item.normalTime, item.timezone);
        if (itemMoment.diff(groupMoment, 'milliseconds') < DEVICE_PARAMS_OFFSET) {
          // add to current group
          group.params.push(item);
        } else {
          // This group is good, add it to our deviceParameters
          this.deviceParameters.push(group);
          // And create a new one, with the current item
          group = {
            normalTime: item.normalTime,
            id: item.id,
            params: [item],
          };
          groupMoment = itemMoment;
        }
      }
      // We don't forget to add the last created group.
      this.deviceParameters.push(group);
    }
    endTimer('initDeviceParameters');
  }

  // initUtilities() {
  //   startTimer('initUtilities');
  //   this.basalUtil = new BasalUtil(this.grouped.basal);
  //   this.bolusUtil = new BolusUtil(this.grouped.bolus);
  //   this.cbgUtil = new BGUtil(this.grouped.cbg, {
  //     bgUnits: this.bgUnits,
  //     bgClasses: this.bgClasses,
  //     DAILY_MIN: (this.opts.CBG_PERCENT_FOR_ENOUGH * this.opts.CBG_MAX_DAILY),
  //   });
  //   this.smbgUtil = new BGUtil(this.grouped.smbg, {
  //     bgUnits: this.bgUnits,
  //     bgClasses: this.bgClasses,
  //     DAILY_MIN: this.opts.SMBG_DAILY_MIN,
  //   });
  //   endTimer('initUtilities');
  // }

  /**
   * Crossfilters used by the daily & trends view.
   */
  initCrossFilters() {
    startTimer('initCrossFilters');
    this.filterData = crossfilter(this.data);
    this.smbgData = crossfilter(_.get(this.grouped, 'smbg', []));
    this.cbgData = crossfilter(_.get(this.grouped, 'cbg', []));
    this.dataByDate = this.createCrossFilter('datetime');
    this.dataById = this.createCrossFilter('id');
    this.smbgByDate = this.createCrossFilter('smbgByDatetime');
    this.smbgByDayOfWeek = this.createCrossFilter('smbgByDayOfWeek');
    this.cbgByDate = this.createCrossFilter('cbgByDatetime');
    this.cbgByDayOfWeek = this.createCrossFilter('cbgByDayOfWeek');
    this.dailyData.cbgByTimestamps = crossfilter(this.dailyData.cbg).dimension((d) => d.timestamps);
    this.dailyData.bolusByTimestamps = crossfilter(this.dailyData.bolus).dimension((d) => d.timestamps);
    this.dailyData.wizardByTimestamps = crossfilter(this.dailyData.wizard).dimension((d) => d.timestamps);
    this.dailyData.foodByTimestamps = crossfilter(this.dailyData.food).dimension((d) => d.timestamps);
    endTimer('initCrossFilters');
  }

  createCrossFilter(dim) {
    let newDim = null;
    const timer = `createCrossFilter(${dim})`;
    startTimer(timer);
    switch (dim) {
    case 'datetime':
      newDim = this.filterData.dimension((d) => d.normalTime);
      break;
    case 'id':
      newDim = this.filterData.dimension((d) => d.id);
      break;
    case 'smbgByDatetime':
      newDim = this.smbgData.dimension((d) => d.normalTime);
      break;
    case 'smbgByDayOfWeek':
      newDim = this.smbgData.dimension((d) => d.localDayOfWeek);
      break;
    case 'cbgByDatetime':
      newDim = this.cbgData.dimension((d) => d.normalTime);
      break;
    case 'cbgByDayOfWeek':
      newDim = this.cbgData.dimension((d) => d.localDayOfWeek);
      break;
    default:
      this.log.error('Invalid dimension ', dim);
    }
    endTimer(timer);
    return newDim;
  }

  /**
   * Return the timezone of the closest data to the specified date
   * @param {moment.Moment} date The date we want the timezone.
   * @returns {string} the timezone found
   */
  getTimezone(date) {
    if (this.data.length < 1) {
      return 'UTC';
    }
    const isoDate = date.toISOString();
    const firstDatum = this.data[0];
    if (isoDate < firstDatum.normalTime) {
      return firstDatum.timezone;
    }
    const lastDatum = this.data[this.data.length - 1];
    if (isoDate > lastDatum.normalTime) {
      return lastDatum.timezone;
    }

    if (this.dataByDate === null) {
      this.dataByDate = crossfilter(this.data).dimension((d) => d.normalTime);
    }
    let rangeSearch = 1; // in hour
    let timezone = 'UTC';
    let found = false;
    let beginRange = moment.utc(date).subtract(rangeSearch, 'hours');
    let endRange = moment.utc(date).add(rangeSearch, 'hours');
    while (!found) {
      this.dataByDate.filterAll();
      this.dataByDate.filterRange([beginRange.toISOString(), endRange.toISOString()]);
      const searchData = this.dataByDate.top(Number.POSITIVE_INFINITY);
      let diff = Number.POSITIVE_INFINITY;
      let selectedDatum = null;
      for (let i = 0; i < searchData.length; i++) {
        const datum = searchData[i];
        const dDiff = Math.abs(date.diff(moment(datum.normalTime)));
        if (dDiff < diff) {
          diff = dDiff;
          selectedDatum = datum;
        }
      }
      if (selectedDatum !== null) {
        found = true;
        timezone = selectedDatum.timezone;
      } else {
        rangeSearch += 1;
        beginRange = moment.utc(date).subtract(rangeSearch, 'hours');
        endRange = moment.utc(date).add(rangeSearch, 'hours');
      }
    }

    return timezone;
  }

  /**
   * Used for the backgrounds colours and the display hours in the daily view.
   */
  initDailyFillData() {
    if (this.diabetesData.length < 2) {
      return;
    }
    startTimer('initDailyFillData');
    const { duration, classes } = this.opts.fillOpts;
    const timezone = this.timePrefs.timezoneName;
    const firstDate = moment.tz(this.endpoints[0], timezone);
    const lastDate = moment.tz(this.endpoints[1], timezone);
    const fillData = [];
    const msPerHour = MS_IN_DAY / 24;

    firstDate.startOf('day');
    lastDate.endOf('day');

    // Generate the fill data for 'duration' hours range
    while (firstDate.isBefore(lastDate)) {
      const hour = firstDate.get('hour');
      if (!_.has(classes, hour)) {
        firstDate.add(duration, 'hours');
        continue;
      }

      const fillColor = _.get(classes, hour);
      const normalTime = firstDate.toISOString();
      const normalEnd = moment(firstDate).add(duration, 'hours').toISOString();
      const id = `fill-${normalTime.replace(/[^\w\s]|_/g, '')}`;
      const fillDate = firstDate.format('YYYY-MM-DD');
      fillData.push({
        fillColor,
        fillDate,
        id,
        normalEnd,
        startsAtMidnight: (hour === 0),
        normalTime,
        timezone,
        type: 'fill',
        displayOffset: 0,
        twoWeekX: hour * msPerHour,
      });
      // For the next fill data
      firstDate.add(duration, 'hours');
    }
    // Add fill datas to the global array
    Array.prototype.push.apply(this.data, fillData);
    this.sortByNormalTime(this.data);
    this.grouped.fill = fillData;
    endTimer('initDailyFillData');
    // this.log.debug('initDailyFillData', fillData);
  }

  /**
   * Data used in the basics tab.
   */
  initBasicsData() {
    startTimer('initBasicsData');
    const deviceSubtypes = [
      'reservoirChange',
      'prime',
      'calibration',
      'deviceParameter',
    ];
    const lastDatum = _.findLast(this.data, (d) => {
      switch (d.type) {
      case 'basal':
      case 'wizard':
      case 'bolus':
      case 'cbg':
      case 'smbg':
      case 'physicalActivity':
      // case 'upload': // filtered
        return true;
      case 'deviceEvent':
        if (_.includes(deviceSubtypes, d.subType)) {
          return true;
        }
        return false;
      default:
        return false;
      }
    });

    if (typeof lastDatum === 'undefined') {
      endTimer('initBasicsData');
      return;
    }
    this.basicsData.timezone = lastDatum.timezone;

    const datumDate = moment.tz(lastDatum.normalTime, lastDatum.timezone);

    { // Basics days & dateRange
      const basicsStart = moment(datumDate);
      basicsStart.startOf('isoWeek').subtract(14, 'days');
      const basicsEnd = moment(datumDate);
      basicsEnd.endOf('isoWeek');
      // Range
      this.basicsData.dateRange = [basicsStart.toISOString(false), datumDate.toISOString(false)];
      // Days
      while (basicsStart.isBefore(basicsEnd)) {
        const date = moment(basicsStart).format('YYYY-MM-DD');
        let type = 'past';
        if (basicsStart.isSame(datumDate, 'day')) {
          type = 'mostRecent';
        } else if (basicsStart.isAfter(datumDate, 'day')) {
          type = 'future';
        }
        this.basicsData.days.push({ type, date });
        basicsStart.add(1, 'day');
      }
    }

    // Filter data for grouped values below
    this.dataByDate.filterAll();
    // @ts-ignore
    this.dataByDate.filterRange(this.basicsData.dateRange);
    const dataRange = this.dataByDate.bottom(Number.POSITIVE_INFINITY);

    const { basicsTypes } = this.opts;
    this.basicsData.data.upload.data = this.grouped.upload;
    const nDatum = dataRange.length;
    for (let i = 0; i < nDatum; i++) {
      const datum = dataRange[i];

      if (!basicsTypes.includes(datum.type)) {
        continue;
      }

      switch (datum.type) {
      case 'upload':
        // Ignore, already taken
        break;
      case 'deviceEvent':
        switch (datum.subType) {
        case 'reservoirChange':
          {
            const reservoirChange = this.basicsData.data.reservoirChange;
            reservoirChange.data.push(datum);
            const day = moment.tz(datum.normalTime, datum.timezone).format('YYYY-MM-DD');
            if (reservoirChange.byDate === null) {
              reservoirChange.byDate = new Map();
            }
            if (reservoirChange.byDate.has(day)) {
              reservoirChange.byDate.get(day).push(datum);
            } else {
              reservoirChange.byDate.set(day, [datum]);
            }
          }
          break;
        case 'prime':
          if (datum.primeTarget === 'cannula') {
            this.basicsData.data.cannulaPrime.data.push(datum);
          } else if (datum.primeTarget === 'tubing') {
            this.basicsData.data.tubingPrime.data.push(datum);
          }
          break;
        case 'calibration':
          this.basicsData.data.calibration.data.push(datum);
          break;
        default:
          // ignore
          break;
        }
        break;
      case 'bolus':
        {
          /*
          db.getCollection('deviceData').find({
            _userId: "abc",
            type: "bolus",
            $and: [
                {time:{$gt: "2020-02-17T00:00"}},
                {time:{$lt: "2020-02-18T00:00"}}
            ]
          })
          */
          const bolus = _.clone(datum);
          // Remove unused infos:
          delete bolus.type;
          delete bolus.subType;
          delete bolus.time;
          delete bolus.timezoneOffset;
          delete bolus.displayOffset;
          delete bolus.clockDriftOffset;
          delete bolus.conversionOffset;
          delete bolus.source;
          delete bolus.deviceSerialNumber;
          delete bolus.deviceId;
          delete bolus.uploadId;
          // Add useful infos:
          if (typeof bolus.normal === 'number' && typeof bolus.expectedNormal === 'number') {
            bolus.interrupted = Math.abs(bolus.normal - bolus.expectedNormal) > Number.EPSILON;
          }
          if (typeof bolus.manual !== 'boolean') {
            bolus.manual = false;
          }
          const day = moment.tz(bolus.normalTime, bolus.timezone).format('YYYY-MM-DD');
          if (this.basicsData.data.bolus.byDate === null) {
            this.basicsData.data.bolus.byDate = new Map();
          }
          if (this.basicsData.data.bolus.byDate.has(day)) {
            this.basicsData.data.bolus.byDate.get(day).push(bolus);
          } else {
            this.basicsData.data.bolus.byDate.set(day, [bolus]);
          }
          // Add to the array
          this.basicsData.data.bolus.data.push(bolus);
        }
        break;
      case 'wizard':
        /*
          db.getCollection('deviceData').find({
            _userId: "abc",
            type: "wizard",
            bolus: {$exists: true},
            $and: [
                {time:{$gt: "2020-02-17T00:00"}},
                {time:{$lt: "2020-02-18T00:00"}}
            ]
          })
        */
        this.basicsData.data.wizard.data.push(datum);
        if (typeof datum.bolus === 'string') {
          // Manual bolus, search for it, and update it
          const boluses = this.dataById.filterAll().filterExact(datum.bolus).top(Number.POSITIVE_INFINITY);
          if (boluses.length > 0) {
            boluses[0].manual = true;
          } else {
            this.log.warn(`Missing global bolus ${datum.bolus} for wizard ${datum.id}`);
          }
          const bolus = this.basicsData.data.bolus.data.find((v) => v.id === datum.bolus);
          if (typeof bolus === 'object') {
            bolus.manual = true;
          }
        } else {
          this.log.info(`No bolus id on wizard ${datum.id}`, _.clone(datum));
        }
        break;
      default:
        {
          /** @type {{data: any[], byDate: Map<string, any[]>}} */
          let group = _.get(this.basicsData.data, datum.type, null);
          if (group === null) {
            group = {data: [], byDate: new Map()};
            _.set(this.basicsData.data, datum.type, group);
          }
          if (!Array.isArray(group.data)) {
            group.data = [];
          }
          if (!(group.byDate instanceof Map)) {
            group.byDate = new Map();
          }
          group.data.push(datum);
          const day = moment.tz(datum.normalTime, datum.timezone).format('YYYY-MM-DD');
          if (group.byDate.has(day)) {
            group.byDate.get(day).push(datum);
          } else {
            group.byDate.set(day, [datum]);
          }
        }
        break;
      }
    }

    // Statistics
    for (const property in this.basicsData.data) {
      /** @type {{data: any[], byDate: Map<string, any[]>, avgPerDay: number, [x: string]: any}} */
      const group = this.basicsData.data[property];
      const nData = group.data.length;
      let nbDays = 0;
      let total = 0;

      if (group.byDate instanceof Map) {
        group.byDate.forEach((value) => {
          this.sortByNormalTime(value);
          nbDays += 1;
          total += value.length;
        });
        if (Math.abs(total - nData) > 0) {
          this.log.warn(`${property} expected total ${total} having ${nData}`);
        }
      }

      // Average entries by day, should be 0 if nbDays is 0
      group.avgPerDay = nbDays < 1 ? 0 : Math.round(total / nbDays);

      switch (property) {
      case 'bolus':
        {
          let nManual = 0; // Wizard
          let nAutomated = 0;
          let nInterrupted = 0;
          for (let i = 0; i < nData; i++) {
            const b = group.data[i];
            if (b.manual) nManual += 1; else nAutomated += 1;
            if (b.interrupted) nInterrupted += 1;
          }
          group.nManual = nManual;
          group.nAutomated = nAutomated;
          group.nInterrupted = nInterrupted;
        }
        break;
      case 'basal':
        {
          let nAutomated = 0;
          let nScheduled = 0;
          for (let i = 0; i < nData; i++) {
            const b = group.data[i];
            if (b.deliveryType === 'automated') {
              nAutomated += 1;
            } else if (b.deliveryType === 'scheduled') {
              nScheduled += 1;
            }
          }
          group.nAutomated = nAutomated;
          group.nScheduled = nScheduled;
        }
        break;
      }
    }

    endTimer('initBasicsData');
  }
}

const DblgPropTypes = PropTypes.shape({
  data: PropTypes.array.isRequired,
  grouped: PropTypes.shape({
    fill: PropTypes.array.isRequired,
    upload: PropTypes.array.isRequired,
    deviceEvent: PropTypes.array.isRequired,
    cbg: PropTypes.array.isRequired,
    smbg: PropTypes.array.isRequired,
  }).isRequired,
  diabetesData: PropTypes.array.isRequired,
  deviceParameters: PropTypes.array.isRequired,
  bgClasses: PropTypes.shape({
    'very-low': PropTypes.shape({ boundary: PropTypes.number.isRequired }).isRequired,
    low: PropTypes.shape({ boundary: PropTypes.number.isRequired }).isRequired,
    target: PropTypes.shape({ boundary: PropTypes.number.isRequired }).isRequired,
    high: PropTypes.shape({ boundary: PropTypes.number.isRequired }).isRequired,
    'very-high': PropTypes.shape({ boundary: PropTypes.number.isRequired }).isRequired,
  }).isRequired,
  bgUnits: PropTypes.oneOf([MGDL_UNITS, MMOLL_UNITS]).isRequired,
  basicsData: PropTypes.shape({
    timezone: PropTypes.string.isRequired,
    dateRange: PropTypes.arrayOf(PropTypes.string).isRequired,
    days: PropTypes.arrayOf(PropTypes.shape({
      type: PropTypes.oneOf(['past', 'mostRecent', 'future']).isRequired,
      date: PropTypes.string.isRequired,
    })).isRequired,
    data: PropTypes.shape({
      bolus: PropTypes.shape({
        data: PropTypes.array.isRequired,
        byDate: PropTypes.instanceOf(Map),
        avgPerDay: PropTypes.number.isRequired,
      })
    }).isRequired,
  }).isRequired,
  filterData:PropTypes.object.isRequired,
  dataByDate: PropTypes.object.isRequired,
});

export { DiabeloopData, DblgPropTypes };
export default DiabeloopData;
