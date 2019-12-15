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
    physicalPadding: 4
  };

  _.defaults(opts, defaults);

  var xPos = function(d) {
    return opts.xScale(Date.parse(d.normalTime));
  };

  function physical(selection) {
    var yPos = opts.r + opts.physicalPadding;
    opts.xScale = pool.xScale().copy();
    selection.each(function(currentData) {
      var filteredData = _.filter(currentData, (data) => {
        return _.get(data, 'duration.value', false);
      });
      var allPhysicals = d3
        .select(this)
        .selectAll('circle.d3-physical-only')
        .data(filteredData, function(d) {
          return d.id;
        });
      var physicalGroup = allPhysicals.enter()
        .append('g')
        .attr({
          'class': 'd3-physical-group',
          id: function(d) {
            return 'physical_group_' + d.id;
          }
        });

      physicalGroup.append('circle').attr({
        cx: xPos,
        cy: yPos,
        r: function(d) {
          return opts.r;
        },
        'stroke-width': 0,
        class: function(d) {
          return 'd3-circle-physicals-' + d.reportedIntensity;
        },
        id: function(d) {
          return 'physicals_' + d.id;
        }
      });

      physicalGroup
        .append('text')
        .text(function(d) {
          return d.duration.value;
        })
        .attr({
          x: xPos,
          y: yPos,
          class: 'd3-physical-text'
        });

      allPhysicals.exit().remove();

      // tooltips
      selection.selectAll('.d3-physical-group').on('mouseover', function() {        
        var parentContainer = document
          .getElementsByClassName('patient-data')[0]
          .getBoundingClientRect();
        var container = this.getBoundingClientRect();
        container.y = container.top - parentContainer.top;

        physical.addTooltip(d3.select(this).datum(), container);
      });

      selection.selectAll('.d3-physical-group').on('mouseout', function() {
        if (_.get(opts, 'onPhysicalOut', false)) {
          opts.onPhysicalOut();
        }
      });
    });
  }

  physical.addTooltip = function(d, rect) {
    if (_.get(opts, 'onPhysicalHover', false)) {
      opts.onPhysicalHover({
        data: d,
        rect: rect
      });
    }
  };

  return physical;
};
