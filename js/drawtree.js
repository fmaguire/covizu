var margin = {top: 10, right: 20, bottom: 10, left: 0},
  width = 250 - margin.left - margin.right,
  height = 1200 - margin.top - margin.bottom;

// set up plotting scales
var xValue = function(d) { return d.x; },
  xScale = d3.scaleLinear().range([0, width]),
  xMap1 = function(d) { return xScale(d.x1); },  // lines
  xMap2 = function(d) { return xScale(d.x2); },
  xWide = function(d) { return xScale(d.x2 - d.x1)};

var yValue = function(d) { return d.y; },
  yScale = d3.scaleLinear().range([height, 30]),  // inversion
  yMap1 = function(d) { return yScale(d.y1); },
  yMap2 = function(d) { return yScale(d.y2); },
  yMap = function(d) { return yScale(yValue(d)+0.4); };


var vis = d3.select("div#svg-timetree")
  .append("svg")
  .attr("width", width + margin.left + margin.right);
  //.attr("height", height + margin.top + margin.bottom);
  //.append("g");

var axis = d3.select("div#svg-timetreeaxis")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", 25)
  .append("g");


/**
 * Draw an open rectangle around the filled rectangle representing
 * a cluster/lineage in the time-scaled tree.
 * @param rect:  d3.Selection object
 */
function draw_cluster_box(rect) {
  var d = rect.datum();
  // draw a box around the cluster rectangle
  vis.append("rect")
    .attr('class', "clickedH")
    .attr("x", xMap1(d)-2)
    .attr("y", yMap(d)-2)
    .attr("width", xWide(d)+4)
    .attr("height", 14)
    .attr("fill", "white")
    .attr("stroke", "black")
    .attr("fill-opacity", 1)
    .attr("stroke-width", 2);

  // move the box to the background by promoting other objects
  rect.raise();
  d3.select("#svg-timetree")
      .selectAll("line")
      .raise();
  d3.select("#svg-timetree")
      .selectAll("text")
      .raise();
}

/**
 * Rectangular layout of tree, update nodes in place with x,y coordinates
 * @param {object} root
 */
function rectLayout(root) {
  // assign vertical positions to tips by postorder traversal
  var counter = 0;
  for (const node of traverse(root, 'postorder')) {
    if (node.children.length === 0) {
      // assign position to tip
      node.y = counter;
      counter++;
    } else {
      // ancestral node position is average of child nodes
      node.y = 0;
      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        node.y += child.y;
      }
      node.y /= node.children.length;
    }
  }

  // assign horizontal positions by preorder traversal
  for (const node of traverse(root, 'preorder')) {
    if (node.parent === null) {
      // assign root to x=0
      node.x = 0.;
    } else {
      node.x = node.parent.x + node.branchLength;
    }
  }
}


/**
 * Draw time-scaled tree in SVG
 * @param {Object} timetree:  time-scaled phylogenetic tree imported as JSON
 * @returns {Array}  data frame
 */
function drawtree(timetree) {
  // generate tree layout (x, y coordinates
  rectLayout(timetree);

  var df = fortify(timetree),
    edgeset = edges(df, rectangular=true);

  // rescale SVG for size of tree
  var ntips = df.map(x => x.children.length === 0).reduce((x,y) => x+y);
  height = ntips*11 + margin.top + margin.bottom;
  vis.attr("height", height);
  yScale = d3.scaleLinear().range([height, 30]);

  // adjust d3 scales to data frame
  xScale.domain([
    d3.min(df, xValue)-0.05, d3.max(df, xValue)+0.2
  ]);
  yScale.domain([
    d3.min(df, yValue)-1, d3.max(df, yValue)+1
  ]);

  // draw lines
  vis.selectAll("lines")
    .data(edgeset)
    .enter().append("line")
    .attr("class", "lines")
    .attr("x1", xMap1)
    .attr("y1", yMap1)
    .attr("x2", xMap2)
    .attr("y2", yMap2)
    .attr("stroke-width", 2)
    .attr("stroke", "#777");

  return(df);
}


/**
 * Map cluster information to tips of the tree.
 * @param {Array} df: data frame extracted from time-scaled tree
 * @param {Array} clusters: data from clusters JSON
 * @returns {Array} subset of data frame annotated with cluster data
 */
function map_clusters_to_tips(df, clusters) {
  // extract accession numbers from phylogeny data frame
  var tips = df.filter(x => x.children.length===0),
    tip_labels = tips.map(x => x.thisLabel);  // accessions

  for (const cidx in clusters) {
    var cluster = clusters[cidx];
    if (cluster["nodes"].length === 1) {
      continue
    }

    // find variant in cluster that matches a tip label
    /*
    var labels = Object.keys(cluster['nodes']),
        root = tip_labels.filter(value => -1 !== labels.indexOf(value))[0];
     */
    var labels = Object.keys(cluster["nodes"]),
        root = tip_labels.filter(value => cluster['lineage'] === value)[0];
    if (root === undefined) {
      console.log("Failed to match cluster of index ", cidx, " to a tip in the tree");
      continue;
    }

    var root_idx = tip_labels.indexOf(root),  // row index in data frame
        root_xcoord = tips[root_idx].x,  // left side of cluster starts at end of tip
        dt;

    // find most recent sample collection date
    var coldates = Array(),
      label, variant;
    for (var i=0; i<labels.length; i++) {
      label = labels[i];
      variant = cluster['nodes'][label];
      coldates = coldates.concat(variant.map(x => x.coldate));
    }
    coldates.sort();  // in place, ascending order

    var first_date = new Date(coldates[0]),
        last_date = new Date(coldates[coldates.length-1]);

    // augment data frame with cluster data
    tips[root_idx].cluster_idx = cidx;
    tips[root_idx].region = cluster.region;
    tips[root_idx].allregions = cluster.allregions;
    tips[root_idx].country = cluster.country;
    tips[root_idx].searchtext = cluster.searchtext;
    tips[root_idx].label1 = cluster["lineage"];
    tips[root_idx].count = coldates.length;
    tips[root_idx].varcount = labels.length;
    tips[root_idx].first_date = first_date;
    tips[root_idx].last_date = last_date;
    tips[root_idx].pdist = cluster.pdist;
    tips[root_idx].rdist = cluster.rdist;

    tips[root_idx].coldate = first_date;
    tips[root_idx].x1 = root_xcoord;
    dt = (last_date - first_date) / 3.154e10;
    tips[root_idx].x2 = root_xcoord + dt;
  }
  return tips;
}





/**
 * Add subtree objects to time-scaled tree.
 * @param {Array} tips, clusters that have been mapped to tips of tree
 */
function draw_clusters(tips) {
  var xaxis_to_date = function(x) {
    var origin = tips[0],
      coldate = new Date(origin.coldate),
      dx = x - origin.x;  // year units
    coldate.setDate(coldate.getDate() + 365.25*dx);
    return (coldate.toISOString().split('T')[0]);
  };

  var date_to_xaxis = function(isodate) {
    const origin = new Date(xaxis_to_date(0));
    var coldate = new Date(isodate);
    return ((coldate - origin) / 3.154e10);
  };

  // Create a div for the tooltip
  let cTooltip = d3.select("#tooltipContainer")
      .style("opacity", 0);

  axis.append("g")
    .attr("class", "treeaxis")
    .attr("transform", "translate(0,20)")
    .call(d3.axisTop(xScale)
      .ticks(3)
      .tickFormat(d => xaxis_to_date(d)));

  function mouseover(d) {
    d3.select("[cidx=cidx-" + d.cluster_idx + "]")
      .attr("txt_hover", "yes");

    cTooltip.transition()       // Show tooltip
            .duration(50)
            .style("opacity", 0.9);

    let ctooltipText = `<b>Mean pairwise distance:</b> ${d.pdist}<br><b>Mean root distance:</b> ${d.rdist}<br><br>`;
    ctooltipText += region_to_string(d.allregions);
    ctooltipText += `<br><b>Number of variants:</b> ${d.varcount}<br>`;
    ctooltipText += `<br><b>Collection dates:</b><br>${formatDate(d.first_date)} / ${formatDate(d.last_date)}<br>`;

    cTooltip.html(ctooltipText)
            .style("left", (d3.event.pageX + 10) + "px")    // Tooltip appears 10 pixels left of the cursor
            .style("top", function(){
            // Position tooltip based on the y-position of the cluster
              let tooltipHeight = cTooltip.node().getBoundingClientRect().height;
              if (d3.event.pageY + tooltipHeight > 1200) {
                return d3.event.pageY - tooltipHeight + "px";
              } else {
                return d3.event.pageY + "px";
              }
            });
  }

  vis.selectAll("rect")
    .data(tips)
    .enter()
    .lower()
    .append("rect")
    //.attr("selected", false)
    .attr("x", xMap1)
    .attr("y", yMap)
    .attr("width", xWide)
    .attr("height", 10)
    .attr("fill", function(d) {
      return(country_pal[d.region]);
    })
    .attr("class", "default")
    .attr("cidx", function(d) { return "cidx-" + d.cluster_idx; })
    .attr("id", function(d, i) { return "id-" + i; })
    .on('mouseover', mouseover)
    .on("mouseout", function() {
      d3.select(this)
        .attr("txt_hover", null);

      cTooltip.transition()     // Hide tooltip
          .duration(50)
          .style("opacity", 0);
    })
    .on("click", function(d) {
      d3.selectAll("rect.clickedH").remove();

      beadplot(d.cluster_idx);

      if (isAccn($('#search-input').val())) {
        $('#search-input').val('');
      }

      search();

      // Reset search stats
      if ($('#search-input').val() !== "") {
	      var stats = search_stats.update({
                current_point: search_stats.get().start_idx[this.id],
                bead_indexer: 0,
        });
        update_search_stats(stats);
      }

      // reset all rectangles to high transparency
      if ($('#search-input').val() === "") {
        vis.selectAll("rect.clicked").attr('class', "default");
      }

      d3.select(this).attr("class", "clicked");

      draw_cluster_box(d3.select(this));

      $("#barplot").text(null);

      gentable(d);
      draw_region_distribution(d.allregions);

      // FIXME: this is the same div used for making barplot SVG
      $("#text-node").text(`Number of cases: ${d.count}\nNumber of variants: ${d.varcount}\n`);

    });

  d3.select("#svg-timetree")
  .selectAll("line")
  .raise();

      // TODO: label tips of time-scaled tree (but with what?)
  vis.selectAll("text")
      .data(tips)
      .enter().append("text")
      .style("font-size", "10px")
      .attr("text-anchor", "start")
      .attr("alignment-baseline", "middle")
      .attr("x", function(d) {
        return(xScale(d.x));
      })
      .attr("y", function(d) {
        return(yScale(d.y-0.15));
      })
      .text(function(d) { return(d.label1); })
      .on("mouseover", function(d) {
	mouseover(d);
      })
      .on("mouseout", function(d) {
        d3.select("[cidx=cidx-" + d.cluster_idx + "]").dispatch('mouseout');
      })
      .on("click", function(d) {
        d3.select("[cidx=cidx-" + d.cluster_idx + "]").dispatch('click');
      });
}
