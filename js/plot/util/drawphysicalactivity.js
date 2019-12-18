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

var d3 = require('d3');
var _ = require('lodash');

var dt = require('../../data/util/datetime');

module.exports = function(pool, opts) {
  opts = opts || {};

  var defaults = {
    width: 12,
    r: 14,
    suspendMarkerWidth: 5,
    markerHeight: 2,
    triangleHeight: 4,
    triangleOffset: 4,
    triangleSize: 6,
    timezoneAware: false,
    tooltipHeightAddition: 3,
    tooltipPadding: 20
  };

  _.defaults(opts, defaults);

  var top = opts.yScale.range()[0];

  var xPosition = function(d) {
    var x = opts.xScale(Date.parse(d.normalTime));
    return x;
  };

  return {
    intensity: function(intens) {
      console.log("intensity");
      console.log(intens);  
      intens.append('rect')
        .attr({
          x: function(d) {
            return xPosition(d);
          },
          y: function(d) {
            return 0;
          },
          width: function(d) {
            console.log(d);
            var s = Date.parse(d.normalTime);
            var duration = d.duration.value;
            var e = Date.parse(dt.addDuration(s, duration * 60 * 1000)); 
            return opts.xScale(e) - opts.xScale(s);
          }, 
          height: function() {
            // return top;
            return pool.height();
          },
          class: function(d) {
            var i = d.reportedIntensity;
            return 'd3-rect-pa-' + i + ' d3-bolus';
          },
          id: function(d) {
            return 'pa_' + d.id;
          }
        });
    },
    tooltip: {
      add: function(d, rect) {
        if (_.get(opts, 'onPhysicalHover', false)) {
          opts.onPhysicalHover({
            data: d, 
            rect: rect
          });
        }
      },
      remove: function(d) {
        if (_.get(opts, 'onPhysicalOut', false)){
          opts.onPhysicalOut({
            data: d
          });
        }
      }
    },
  };
};
