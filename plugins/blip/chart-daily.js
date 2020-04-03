/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2020, Diabeloop
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
 * not, you can obtain one from the Open Source Initiative (OSI) at
 * https://opensource.org/licenses/BSD-2-Clause.
 * == BSD2 LICENSE ==
 */

/** @typedef { import("../../js/diabeloop-data").DiabeloopData } DiabeloopData */
import React from 'react';
import PropTypes from 'prop-types';
// import i18next from 'i18next';
import moment from 'moment-timezone';
import bows from 'bows';
import _ from 'lodash';

import Constants from '../../js/data/util/constants';
import { DblgPropTypes } from '../../js/diabeloop-data';
import './chart-daily.less';

const WIDGETS_GAP = 20;
const SCROLL_ELEM_NONE = 0;
const SCROLL_ELEM_SLIDER = 1;
const SCROLL_ELEM_SLIDER_OUT = 2;

/**
 * Daily view rendered as an SVG image.
 * @augments {React.Component<{containerId: string, className: string, diabeloopData: DiabeloopData, datetimeLocation: string, trackMetric: (m?: string) => void}>}
 */
class ChartDaily extends React.Component {
  constructor(props) {
    super(props);

    const { diabeloopData, datetimeLocation } = this.props;

    const mTime = moment.tz(datetimeLocation, diabeloopData.timePrefs.timezoneName);
    const mStart = moment.tz(diabeloopData.endpoints[0], diabeloopData.timePrefs.timezoneName);
    const mEnd = moment.tz(diabeloopData.endpoints[1], diabeloopData.timePrefs.timezoneName);

    this.state = {
      minTimestamps: mStart.valueOf(),
      maxTimestamps: mEnd.valueOf(),
      timestamps: mTime.valueOf(),
      svgWidth: 900,
      scrollElem: SCROLL_ELEM_NONE,
      // scaleX: 1,
      // scaleY: 1,
    };

    this.log = bows('TChartDaily');
    // this.divRef = React.createRef();
    this.currentHeight = 0;

    this.onClickScrollBar = this.onClickScrollBar.bind(this);
    this.onMouseDownSlider = this.onMouseDownSlider.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);

    this.scrollTo = _.throttle(this.scrollTo.bind(this), 30);
  }

  componentDidMount() {
    // const svgNode = this.divRef.current;
    // this.setState({ svgWidth: svgNode.clientWidth });
    // this.log.debug('Mount clientWidth:', svgNode.clientWidth);
  }

  render() {
    const { containerId, className } = this.props;
    const svg = this.renderSVG();
    return (
      <div id={containerId} className={className}>
        {svg}
      </div>
    )
  }

  renderSVG() {
    const { svgWidth, timestamps } = this.state;

    if (svgWidth === 0) {
      return null;
    }

    const firstTimestamp = timestamps - Constants.MS_IN_DAY / 2; // -12h
    const lastTimestamp = firstTimestamp + Constants.MS_IN_DAY; //  +24h
    const scaleX = svgWidth / (lastTimestamp - firstTimestamp);

    this.currentHeight = 0;
    const cbg = this.renderCBG(firstTimestamp, lastTimestamp, scaleX);
    this.currentHeight += WIDGETS_GAP; // margin
    const bolus = this.renderBolus(firstTimestamp, lastTimestamp, scaleX);
    this.currentHeight += WIDGETS_GAP; // margin
    const scroll = this.renderScrollBar();
    this.currentHeight += WIDGETS_GAP; // margin

    return (
      <svg
        id="svgDailyView"
        width={svgWidth}
        height="590"
        onMouseLeave={this.onMouseLeave}
        onMouseUp={this.onMouseUp}
        onMouseMove={this.onMouseMove}>
        {cbg}
        {bolus}
        {scroll}
      </svg>
    );
  }

  /**
   * Render CBG, SMBG
   * @param {number} firstTimestamp
   * @param {number} lastTimestamp
   * @param {number} scaleX
   */
  renderCBG(firstTimestamp, lastTimestamp, scaleX) {
    const svgHeight = 175;
    const { svgWidth } = this.state;
    const { diabeloopData } = this.props;
    const bgClasses = diabeloopData.bgClasses;

    const veryLow = /** @type {number} */ (bgClasses['very-low'].boundary);
    const low = /** @type {number} */ (bgClasses.low.boundary);
    const target = /** @type {number} */ (bgClasses.target.boundary);
    const high = /** @type {number} */ (bgClasses.high.boundary);
    const veryHigh = /** @type {number} */ (bgClasses['very-high'].boundary);

    const scaleY = svgHeight / (diabeloopData.dailyData.cbgMax * 1.05); // Add 5% of margin

    const cbgFilter = diabeloopData.dailyData.cbgByTimestamps.filterAll().filterRange([firstTimestamp, lastTimestamp]);
    const cbgData = cbgFilter.bottom(Number.POSITIVE_INFINITY);

    const datumPosX = (/** @type {{timestamps: number}} */ d) => (d.timestamps - firstTimestamp) * scaleX;
    const datumPosY = (/** @type {{value: number}} */ d) => (svgHeight - (d.value * scaleY)); // 0 = top of the drawing, so inverse the coordinate
    const datumColor = ( /** @type {{value: number}} */ d) => {
      if (d.value < veryLow) {
        return 'cbg-very-low';
      }
      if (d.value < low) {
        return 'cbg-low';
      }
      if (d.value < target) {
        return 'cbg-target';
      }
      if (d.value < high) {
        return 'cbg-high';
      }
      return 'cbg-very-high';
    };

    const svgDots = [];
    let prevX = -4;
    let prevY = svgHeight;
    for (let i = 0; i < cbgData.length; i++) {
      const d = cbgData[i];
      const posX = datumPosX(d);
      const posY = datumPosY(d);
      // Avoid display too much datum which are too closed:
      if (posX - prevX > 6 || Math.abs(prevY - posY) > 6) {
        svgDots.push(
          <circle id={d.id} cx={posX} cy={posY} r="3" key={d.id} className={datumColor(d)} />
        );
        prevX = posX;
        prevY = posY;
      }
    }

    // TODO return this value
    this.currentHeight += svgHeight;

    return (
      <g id="dailyCbgData" transform={`translate(0, ${(this.currentHeight - svgHeight)})`}>
        <rect fill="#ddd" width={svgWidth} height={svgHeight} />
        <line id="cbg-bound-very-low" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={datumPosY({value: veryLow})} y2={datumPosY({value: veryLow})} />
        <line id="cbg-bound-low" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={datumPosY({value: low})} y2={datumPosY({value: low})} />
        <line id="cbg-bound-target" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={datumPosY({value: target})} y2={datumPosY({value: target})} />
        <line id="cbg-bound-high" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={datumPosY({value: high})} y2={datumPosY({value: high})} />
        <line id="cbg-bound-very-high" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={datumPosY({value: veryHigh})} y2={datumPosY({value: veryHigh})} />
        {svgDots}
      </g>
    );
  }
  /**
   * Render CBG, SMBG
   * @param {number} firstTimestamp
   * @param {number} lastTimestamp
   * @param {number} scaleX
   */
  renderBolus(firstTimestamp, lastTimestamp, scaleX) {
    const svgHeight = 110;
    const { svgWidth } = this.state;
    const { diabeloopData } = this.props;
    const { bolusByTimestamps, foodByTimestamps, wizardByTimestamps } = diabeloopData.dailyData;
    const bolusBars = [];
    const foodInfos = []; // meal / Rescue carbs
    const wizardInfos = []; // carbInput

    const scaleY = (svgHeight - 28) / (diabeloopData.dailyData.bolusMax * 1.05); // Add 5% of margin + 28 for food/wizard
    const bolusFilter = bolusByTimestamps.filterAll().filterRange([firstTimestamp, lastTimestamp]);
    const bolusData = bolusFilter.bottom(Number.POSITIVE_INFINITY);
    const foodFilter = foodByTimestamps.filterAll().filterRange([firstTimestamp, lastTimestamp]);
    const foodData = foodFilter.bottom(Number.POSITIVE_INFINITY);
    const wizardFilter = wizardByTimestamps.filterAll().filterRange([firstTimestamp, lastTimestamp]);
    const wizardData = wizardFilter.bottom(Number.POSITIVE_INFINITY);

    const datumPosX = (/** @type {{timestamps: number}} */ d) => (d.timestamps - firstTimestamp) * scaleX;
    // 0 = top of the drawing, so inverse the coordinate, 28 for food/wizard circles values
    const datumPosY = (/** @type {{value: number}} */ d) => (svgHeight - 28 - (d.value * scaleY));

    for (let i = 0; i < bolusData.length; i++) {
      const d = bolusData[i];
      const posX = datumPosX(d);
      const posY = datumPosY(d);
      bolusBars.push(
        <line id={`bolus-d-${d.id}`} key={`bolus-d-${d.id}`} x1={posX} x2={posX} y1={svgHeight} y2={posY} className="bolus-delivered" />
      );
      if (d.expectedValue > d.value) {
        const expPosY = datumPosY({value: d.expectedValue});
        bolusBars.push(
          <line id={`bolus-e-${d.id}`} key={`bolus-e-${d.id}`} x1={posX} x2={posX} y1={posY} y2={expPosY} className="bolus-expected" />
        );
      }
    }

    for (let i = 0; i < foodData.length; i++) {
      const d = foodData[i];
      const posX = datumPosX(d);
      foodInfos.push(
        <g id={d.id} key={d.id} transform={`translate(${posX}, 0)`}>
          <circle cx="0" cy={14} r={14} className="food-circle" />
          <text x="0" y={14} className="food-value">{d.value}</text>
        </g>
      );
    }

    for (let i = 0; i < wizardData.length; i++) {
      const d = wizardData[i];
      const posX = datumPosX(d);
      wizardInfos.push(
        <g id={d.id} key={d.id} transform={`translate(${posX}, 0)`}>
          <circle cx="0" cy={14} r={14} className="wizard-circle" />
          <text x="0" y={14} className="wizard-value">{d.value}</text>
        </g>
      );
    }

    // TODO return this value
    this.currentHeight += svgHeight;

    return (
      <g id="dailyBolusData" transform={`translate(0, ${(this.currentHeight - svgHeight)})`}>
        <rect fill="#ddd" width={svgWidth} height={svgHeight} />
        {bolusBars}
        {foodInfos}
        {wizardInfos}
      </g>
    );

  }

  renderScrollBar() {
    const sliderWidth = 48;
    const { svgWidth, timestamps, minTimestamps, maxTimestamps } = this.state;
    const scaleX = svgWidth / (maxTimestamps - minTimestamps);
    const posX = (timestamps - minTimestamps) * scaleX;

    this.currentHeight += 20;

    return (
      <g id="dailyScrollbar" transform={`translate(0, ${(this.currentHeight - 20)})`}>
        <line id="dailyScrollbarBackground" x1="10" x2={(svgWidth - 10)} y1="0" y2="0" onClick={this.onClickScrollBar} />
        <line id="dailyScrollbarSlider" x1={posX - sliderWidth/2} x2={posX + sliderWidth/2} y1="0" y2="0" onMouseDown={this.onMouseDownSlider} />
      </g>
    );
  }

  /**
   * @param {React.MouseEvent} e a mouse event
   * @returns {number} The timestamps of the current mouse position.
   */
  getTimestampFromMouseEvent(e) {
    const { minTimestamps, maxTimestamps } = this.state;
    const bRect = e.currentTarget.getBoundingClientRect();
    const relPosX = (e.clientX - bRect.x) / bRect.width; // svgWidth should be equal to bRect.width
    const diffTimestamps = maxTimestamps - minTimestamps;
    let timestamps = minTimestamps + relPosX * diffTimestamps;
    timestamps = Math.max(timestamps, minTimestamps + Constants.MS_IN_DAY / 2);
    timestamps = Math.min(timestamps, maxTimestamps - Constants.MS_IN_DAY / 2);

    return timestamps;
  }

  /**
   * Throttled code for moving the current timestamp.
   * @param {number} timestamps
   */
  scrollTo(timestamps) {
    // this.log.debug('Scroll to', moment(timestamps).toISOString());
    this.setState({ timestamps });
  }

  onClickScrollBar(e) {
    this.log.debug('onClickScrollBar', e.currentTarget.id);
    e.preventDefault();
    const timestamps = this.getTimestampFromMouseEvent(e);
    this.log.debug('Scroll to', moment(timestamps).toISOString());
    this.setState({ timestamps });
  }

  /** @param {React.MouseEvent} e click event */
  onMouseDownSlider(e) {
    if (e.buttons === 1) {
      this.setState({ scrollElem: SCROLL_ELEM_SLIDER });
    }
  }

  /** @param {React.MouseEvent} e click event */
  onMouseUp(e) {
    const { scrollElem } = this.state;
    if (scrollElem) {
      e.preventDefault();
      e.stopPropagation();
      this.setState({ scrollElem: SCROLL_ELEM_NONE });
    }
  }

  /** @param {React.MouseEvent} e click event */
  onMouseMove(e) {
    const { scrollElem } = this.state;
    if (scrollElem) {
      if (e.buttons !== 1) {
        this.setState({ scrollElem: SCROLL_ELEM_NONE });
      } else {
        e.preventDefault();
        e.stopPropagation();
        const timestamps = this.getTimestampFromMouseEvent(e);
        this.scrollTo(timestamps);
      }
    }
  }

  /** @param {React.MouseEvent} e click event */
  onMouseLeave(e) {
    const { scrollElem } = this.state;
    let newStatus = SCROLL_ELEM_NONE;

    switch (scrollElem) {
    case SCROLL_ELEM_SLIDER:
      newStatus = SCROLL_ELEM_SLIDER_OUT;
      break;
    }

    if (newStatus) {
      e.preventDefault();
      this.setState({ scrollElem: newStatus });
    }
  }

  onMouseEnter(e) {
    const { scrollElem } = this.state;
    if (scrollElem) {
      let newStatus = SCROLL_ELEM_NONE;
      switch (scrollElem) {
      case SCROLL_ELEM_SLIDER_OUT:
        newStatus = SCROLL_ELEM_SLIDER;
        break;
      }
      e.preventDefault();
      this.setState({ scrollElem: newStatus });
    }
  }
}

ChartDaily.propTypes = {
  diabeloopData: DblgPropTypes.isRequired,
  datetimeLocation: PropTypes.string.isRequired,
  // patient: PropTypes.object.isRequired,
  // chartPrefs: PropTypes.object.isRequired,
  containerId: PropTypes.string.isRequired,
  className: PropTypes.string.isRequired,
  trackMetric: PropTypes.func,
};

ChartDaily.defaultProps = {
  trackMetric: () => {}
};

export default ChartDaily;
