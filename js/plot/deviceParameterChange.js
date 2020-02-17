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

/* jshint esversion:6 */

var d3 = require('d3');
var _ = require('lodash');

module.exports = function(pool, opts) {
  var defaults = {
    r: 14,
    padding: 4
  };

  _.defaults(opts, defaults);

  var picto = require('../../img/sitechange-diabeloop.png');
  var height = pool.height();
  var offset = height / 5 ;
  var width = 40;
  var xPos = function(d) {
    return opts.xScale(Date.parse(d.normalTime)) - (width / 2) ;
  };

  function parameter(selection) {
    var yPos = opts.r + opts.padding;
    opts.xScale = pool.xScale().copy();
    // console.log(opts.data);
    console.log('selection');
    console.log(selection);
    selection.each(function(currentData) {
      console.log("deviceParameter");
      // console.log(opts.data);
      var filteredData = _.filter(currentData, {
          subType: 'deviceParameter'
        });
      // var filteredData = currentData;
      var allParameters = d3
        .select(this)
        .selectAll('circle.d3-param-only')
        .data(filteredData, function(d) {
          return d.id;
        });
      var parameterGroup = allParameters.enter()
        .append('g')
        .attr({
          'class': 'd3-param-group',
          id: function(d) {
            return 'param_group_' + d.id;
          }
        });
        
      parameterGroup.append('circle').attr({
        cx: xPos,
        cy: yPos,
        r: function() {
            return opts.r;
          },
        height: function() {
          return offset;
        },
      'stroke-width': 0,
        class: 'd3-param',
        id: function(d) {
          return 'param_' + d.id;
        }
      });
  
      parameterGroup
      .append('text')
      .text(function(d) {
        return 'P';
      })
      .attr({
        x: xPos,
        y: yPos,
      class: 'd3-param-text'
      });

      // parameterGroup.append('image')
      //   .attr({
      //     x: function(d) {
      //       return xPos(d);
      //     },
      //     y: function(d) {
      //       return 0;
      //     },
      //     width: width, 
      //     height: function() {
      //       return offset;
      //     },
      //     'xlink:href': picto,
      //   });

      allParameters.exit().remove();

      // tooltips
      selection.selectAll('.d3-param-group').on('mouseover', function() {         console.log('addToolTip deviceParam')
        console.log(parameter);
        var parentContainer = document
          .getElementsByClassName('patient-data')[0]
          .getBoundingClientRect();
        console.log(parentContainer);
        var container = this.getBoundingClientRect();
        container.y = container.top - parentContainer.top;
        console.log(container);

        parameter.addTooltip(d3.select(this).datum(), container);
      });

      selection.selectAll('.d3-param-group').on('mouseout', function() {
        if (_.get(opts, 'onParameterOut', false)) {
          opts.onParameterOut();
        }
      });
    });
  }

  parameter.addTooltip = function(d, rect) {
    console.log('parameter.addTooltip');
    console.log(d);
    console.log(opts);
    if (_.get(opts, 'onParameterHover', false)) {
      opts.onParameterHover({
        data: d,
        rect: rect
      });
    }
  };

  return parameter;
};
