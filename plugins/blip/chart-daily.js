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
    const { svgWidth } = this.state;

    if (svgWidth === 0) {
      return null;
    }

    this.currentHeight = 0;
    const cbg = this.renderCBG();
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
        {scroll}
      </svg>
    );
  }

  renderCBG() {
    const svgHeight = 175;
    const { svgWidth, timestamps } = this.state;
    const { diabeloopData } = this.props;
    const bgClasses = diabeloopData.bgClasses;

    const veryLow = /** @type {number} */ (bgClasses['very-low'].boundary);
    const low = /** @type {number} */ (bgClasses.low.boundary);
    const target = /** @type {number} */ (bgClasses.target.boundary);
    const high = /** @type {number} */ (bgClasses.high.boundary);
    const veryHigh = /** @type {number} */ (bgClasses['very-high'].boundary);

    const firstTimestamp = timestamps - Constants.MS_IN_DAY / 2; // -12h
    const lastTimestamp = firstTimestamp + Constants.MS_IN_DAY; //  +24h
    const scaleX = svgWidth / (lastTimestamp - firstTimestamp);
    const scaleY = svgHeight / (diabeloopData.dailyData.cbgMax * 1.05); // Add 5% of margin

    const cbgFilter = diabeloopData.cbgByTimestamps.filterAll().filterRange([firstTimestamp, lastTimestamp]);
    const cbgData = cbgFilter.bottom(Number.POSITIVE_INFINITY);

    const cbgPosX = (/** @type {{timestamps: number}} */ d) => (d.timestamps - firstTimestamp) * scaleX;
    const cbgPosY = (/** @type {{value: number}} */ d) => (svgHeight - (d.value * scaleY)); // 0 = top of the drawing, so inverse the coordinate
    const cbgColor = ( /** @type {{value: number}} */ d) => {
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
    // let leftOver = 0;
    for (let i = 0; i < cbgData.length; i++) {
      const d = cbgData[i];
      const posX = cbgPosX(d);
      const posY = cbgPosY(d);
      if (posX - prevX > 6 || Math.abs(prevY - posY) > 6) {
        svgDots.push(
          <circle id={`cbg-${d.id}`} cx={posX} cy={posY} r="3" key={d.id} className={cbgColor(d)} />
        );
        prevX = posX;
        prevY = posY;
      // } else {
      //   leftOver++;
      }
    }

    // this.log.info('number of cbg not rendered:', leftOver);
    this.currentHeight += svgHeight;

    return (
      <g id="dailyCbgData" transform={`translate(0, ${(this.currentHeight - svgHeight)})`}>
        <rect fill="#ddd" width={svgWidth} height={svgHeight} />
        <line id="cbg-bound-very-low" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={cbgPosY({value: veryLow})} y2={cbgPosY({value: veryLow})} />
        <line id="cbg-bound-low" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={cbgPosY({value: low})} y2={cbgPosY({value: low})} />
        <line id="cbg-bound-target" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={cbgPosY({value: target})} y2={cbgPosY({value: target})} />
        <line id="cbg-bound-high" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={cbgPosY({value: high})} y2={cbgPosY({value: high})} />
        <line id="cbg-bound-very-high" stroke="#f0f0f0" x1="0" x2={svgWidth} y1={cbgPosY({value: veryHigh})} y2={cbgPosY({value: veryHigh})} />
        {svgDots}
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
