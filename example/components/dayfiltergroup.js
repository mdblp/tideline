var PropTypes = require('prop-types');
/* 
 * == BSD2 LICENSE ==
 */

var React = require('react');
var cx = require('classnames');

var DayGrouping = React.createClass({
  propTypes: {
    active: PropTypes.bool.isRequired,
    category: PropTypes.string.isRequired,
    days: PropTypes.array.isRequired,
    onClickGroup: PropTypes.func.isRequired
  },
  render: function() {
    var groupClass = cx({
      'daysGroup': true,
      'active': this.props.active
    }) + ' ' + this.props.category;
    /* jshint ignore:start */
    return (
      <div className={groupClass} onClick={this.handleDaysGroupClick}>{this.props.days}</div>
      );
    /* jshint ignore:end */
  },
  handleDaysGroupClick: function() {
    this.props.onClickGroup(this.props.category);
  }
});

module.exports = DayGrouping;