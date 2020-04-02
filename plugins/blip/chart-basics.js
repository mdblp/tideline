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
import i18next from 'i18next';
import moment from 'moment-timezone';
import bows from 'bows';
import _ from 'lodash';

import Constants from '../../js/data/util/constants';
import { DblgPropTypes } from '../../js/diabeloop-data';
import './chart-basics.less';
// @ts-ignore
import siteChangeIcon from './basics/components/sitechange/sitechange_diabeloop.png';

const t = i18next.t.bind(i18next);

/** @param {{numElements: number, icon?: any}} props */
function SVGCalendarIcon(props) {
  const { icon, numElements } = props;
  let iconContent = null;

  if (numElements > 0) {
    if (typeof icon !== 'undefined') {
      iconContent = (<image x="0" y="0" width="72" height="72" xlinkHref={icon} />);
    } else {
      const circles = [];
      const nBigCircles = Math.min(8, numElements);
      for (let i = 0; i < nBigCircles; i++) {
        const cx = 12 + 24 * (i % 3);
        const cy = 12 + 24 * Math.floor(i / 3);
        const id = `lc-${cx}-${cy}`;
        circles.push(<circle className="large-circle" cx={cx} cy={cy} r="8" key={id} />);
      }
      if (numElements > nBigCircles) {
        const lastSmallCircles = Math.min(9, numElements - 8);
        const smallCircles = [];
        for (let i = 0; i < lastSmallCircles; i++) {
          const cx = 4 + 6 * (i % 3);
          const cy = 4 + 6 * Math.floor(i / 3);
          const id = `sc-${cx}-${cy}`;
          smallCircles.push(<circle cx={cx} cy={cy} r="2" className="small-circle" key={id} />);
        }
        circles.push(<g key="small-circles" className="small-circles" transform="translate(50, 50)">{smallCircles}</g>);
      }
      iconContent = (
        <g className="calendar-icon-circles">
          {circles}
        </g>
      );
    }
  }

  return (
    <svg width="72" height="72">
      {iconContent}
    </svg>
  )
}

/**
 * @augments {React.Component<{type: string, day:{type: string, date: string}, timezone: string, dateFormat: string, values?: {id: string, normalTime: string, timezone: string}[], icon?: any, onClick: (day: string, type: string) => void}>}
 */
class CalendarDay extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hover: false,
    }

    this.onClick = this.onClick.bind(this);
    this.onMouseOver = this.onMouseOver.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
  }

  render() {
    const { hover } = this.state;
    const { day, timezone, dateFormat, type, values, icon } = this.props;
    const date = <span>{moment.tz(day.date, timezone).format(dateFormat)}</span>;

    let hoverText = null;
    if (hover && Array.isArray(values) && values.length > 0) {
      switch (type) {
      case 'bolus':
        hoverText = <span><br />{values.length.toString(10)}</span>;
        break;
      case 'reservoirChange':
        {
          hoverText = [];
          const nChanges = Math.min(3, values.length);
          for (let i = 0; i < nChanges; i++) {
            const hour = moment.tz(values[i].normalTime, values[i].timezone).format(Constants.H_MM_A_FORMAT);
            hoverText.push(<br key={`br-${values[i].id}`}/>);
            hoverText.push(<span key={hour}>{hour}</span>);
          }
          if (nChanges < values.length) {
            hoverText.push(<br key="br-more" />);
            hoverText.push(<span key="more">…</span>);
          }
        }
        break;
      }
    }

    let dayClassName = 'chart-calendar-day';
    if (day.type === 'future') {
      dayClassName = `${dayClassName} day-disabled`;
    }

    return (
      <div className={dayClassName} onMouseOver={this.onMouseOver} onMouseOut={this.onMouseOut} onClick={this.onClick}>
        <p>{date}{hoverText}</p>
        <div className="chart-calendar-day-icon">
          <SVGCalendarIcon icon={icon} numElements={Array.isArray(values) ? values.length : 0} />
        </div>
      </div>
    );
  }

  /** @param {React.MouseEvent} e */
  onClick(e) {
    const { values, day, type, onClick } = this.props;
    e.preventDefault();
    if (Array.isArray(values) && values.length > 0) {
      const value = values[0];
      const date = moment.tz(value.normalTime, value.timezone).toISOString();
      onClick(date, type);
    } else {
      onClick(`${day.date}T12:00:00.000Z`, type);
    }
  }

  onMouseOver() {
    const { hover } = this.state;
    if (!hover) {
      this.setState({ hover: true });
    }
  }

  onMouseOut() {
    this.setState({ hover: false });
  }
}

/** @param {{diabeloopData: DiabeloopData, type: string, filter: () => boolean|null, icon?: any, onClick: (day: string, type: string) => void}} props */
function Calendar(props) {
  const weekDays = [];
  const btnDays = [];
  const { diabeloopData, type, filter, icon, onClick } = props;
  const { dateRange, timezone, days, data } = diabeloopData.basicsData;
  const mWeekdays = moment.tz(dateRange[0], timezone);
  const dayFormat = Constants.DDD_FORMAT;
  const dateFormat = Constants.MMMM_D_FORMAT;
  const calendarClass = `chart-calendar chart-calendar-${type}`;
  const log = bows(`Calendar - ${type}`);

  for (let i = 0; i < 7; i++) {
    const day = mWeekdays.format(dayFormat);
    weekDays.push(<span className="chart-calendar-weekday" key={day}>{day}</span>);
    mWeekdays.add(1, 'day');
  }

  const byDate = _.get(data, `${type}.byDate`, null);
  if (!(byDate instanceof Map)) {
    log.info('Missing byDate map');
  }

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    /** @type{null|{id: string, normalTime: string, timezone: string}[]} */
    let values = null;
    if (byDate instanceof Map) {
      values = byDate.has(day.date) ? byDate.get(day.date) : null;
      if (filter !== null && values !== null) {
        values = values.filter(filter);
      }
    }

    btnDays.push(
      <CalendarDay
        type={type}
        day={day}
        key={day.date}
        timezone={timezone}
        dateFormat={dateFormat}
        values={values}
        icon={icon}
        onClick={onClick}
      />
    );
  }

  return (
    <div className={calendarClass}>
      <div className="chart-calendar-weekdays">
        {weekDays}
      </div>
      <div className="chart-calendar-days">
        {btnDays}
      </div>
    </div>
  );
}

/**
 * @augments {React.Component<{containerId: string, className: string, diabeloopData: DiabeloopData, onSelectDay: (date: string, title: string) => void, trackMetric: (m?: string) => void}>}
 */
class ChartBasics extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      bolus: {
        selected: 'total'
      }
    };
    this.log = bows('ChartBasics');
    this.onClickBtnSummary = this.onClickBtnSummary.bind(this);
    this.onClickCalendarDay = this.onClickCalendarDay.bind(this);
  }

  render() {
    const { containerId, className } = this.props;
    return (
      <div id={containerId} className={className}>
        {[
          this.renderBolus(),
          this.renderSiteChange(),
        ]}
      </div>
    )
  }

  renderBolus() {
    const { bolus } = this.state;
    const { diabeloopData } = this.props;
    const { avgPerDay, nManual, nAutomated, nInterrupted, data } = diabeloopData.basicsData.data.bolus;
    const total = data.length;
    const pManual = Math.round(nManual * 100 / total);
    const pAutomated = Math.round(nAutomated * 100 / total);
    const pInterrupted = Math.round(nInterrupted * 100 / total);

    const btnPrimary = `info-button info-primary ${bolus.selected === 'total' ? 'info-button-selected' : ''}`;
    const btnManual = `info-button info-other ${bolus.selected === 'manual' ? 'info-button-selected' : ''}`;
    const btnAutomated = `info-button info-other ${bolus.selected === 'automated' ? 'info-button-selected' : ''}`;
    const btnInterrupted = `info-button info-other ${bolus.selected === 'interrupted' ? 'info-button-selected' : ''}`;

    let filter = null;
    switch (bolus.selected) {
    case 'manual':
      filter = (v) => v.manual;
      break;
    case 'automated':
      filter = (v) => !v.manual;
      break;
    case 'interrupted':
      filter = (v) => v.interrupted;
      break;
    }

    return (
      <div key={'bolus'} className="dashboard-section dashboard-section-bolus">
        <h3 className="dashboard-section-title">{t('Bolusing')}</h3>
        <div className="dashboard-section-summary">
          <div className="summary-info summary-info-primary">
            <div className={btnPrimary} onClick={this.onClickBtnSummary} data-type="bolus" data-btn="total">
              <p className="summary-avg">{t('Avg per day')}</p>
              <p>{avgPerDay}</p>
              <p className="summary-total">{t('Total: {{total}}', { total })}</p>
            </div>
          </div>
          <div className="summary-info summary-info-others">
            <div className={btnManual} onClick={this.onClickBtnSummary} data-type="bolus" data-btn="manual">
              <p className="info-other-title">{t('Manual')}</p>
              <p className="info-other-value">{nManual}</p>
              <p className="info-other-percentage">({pManual}%)</p>
            </div>
            <div className={btnAutomated} onClick={this.onClickBtnSummary} data-type="bolus" data-btn="automated">
              <p className="info-other-title">{t('Automated')}</p>
              <p className="info-other-value">{nAutomated}</p>
              <p className="info-other-percentage">({pAutomated}%)</p>
            </div>
            <div className={btnInterrupted} onClick={this.onClickBtnSummary} data-type="bolus" data-btn="interrupted">
              <p className="info-other-title">{t('Interrupted')}</p>
              <p className="info-other-value">{nInterrupted}</p>
              <p className="info-other-percentage">({pInterrupted}%)</p>
            </div>
          </div>
        </div>
        <div className="dashboard-section-calendar">
          <Calendar diabeloopData={diabeloopData} type="bolus" filter={filter} onClick={this.onClickCalendarDay} />
        </div>
      </div>
    );
  }

  renderSiteChange() {
    const { diabeloopData } = this.props;
    return (
      <div key={'siteChange'} className="dashboard-section dashboard-section-sitechange">
        <h3 className="dashboard-section-title">{t('Infusion site changes')}</h3>
        <div className="dashboard-section-calendar">
          <Calendar diabeloopData={diabeloopData} type="reservoirChange" filter={null} icon={siteChangeIcon} onClick={this.onClickCalendarDay} />
        </div>
      </div>
    );
  }

  // renderTemplate() {
  //   const { diabeloopData } = this.props;
  //   let filter = null;
  //   return (
  //     <div key={'template'} className="dashboard-section dashboard-section-template">
  //       <h3 className="dashboard-section-title">{t('Template')}</h3>
  //       <div className="dashboard-section-summary">
  //         <div className="summary-info summary-info-primary"></div>
  //         <div className="summary-info summary-info-others"></div>
  //       </div>
  //       <div className="dashboard-section-calendar">
  //         <Calendar diabeloopData={diabeloopData} type="template" filter={filter} icon={null} />
  //       </div>
  //     </div>
  //   );
  // }

  /**
   * @param {string} day
   * @param {string} type
   */
  onClickCalendarDay(day, type) {
    this.props.onSelectDay(day, `basics-${type}`);
  }

  /** @param {React.MouseEvent} e */
  onClickBtnSummary(e) {
    e.preventDefault();
    const type = e.currentTarget.getAttribute('data-type');
    const btn = e.currentTarget.getAttribute('data-btn');
    const change = {};
    change[type] = {
      selected: btn,
    };
    this.setState(change, () => {
      this.props.trackMetric(`Basics click summary ${type} ${btn}`);
    });
  }
}

ChartBasics.propTypes = {
  diabeloopData: DblgPropTypes.isRequired,
  patient: PropTypes.object.isRequired,
  onSelectDay: PropTypes.func.isRequired,
  chartPrefs: PropTypes.object.isRequired,
  updateBasicsData: PropTypes.func.isRequired,
  containerId: PropTypes.string.isRequired,
  className: PropTypes.string.isRequired,
  trackMetric: PropTypes.func,
};

ChartBasics.defaultProps = {
  trackMetric: () => {}
};

export default ChartBasics;
