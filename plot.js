// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.plot = function(jade) {

    ///////////////////////////////////////////////////////////////////////////////
    //
    //  Waveform plotting
    //
    ///////////////////////////////////////////////////////////////////////////////

    // return [first tick value >= vmin, tick interval]
    function tick_interval(vmin,vmax,nticks) {
        var log_vtick = Math.log((vmax - vmin)/Math.max(1,nticks))/Math.LN10;
        var exponent = Math.floor(log_vtick);
        var mantissa = Math.pow(10,log_vtick - exponent);  // between 1 and 10

        // pick tick interval based on 1,2,5 progression of scope divisions
        var interval;
        if (mantissa >= 4.99) interval = 5;
        else if (mantissa >= 1.99) interval = 2;
        else interval = 1;
        interval *= Math.pow(10,exponent);   // scale correctly

        var vstart = Math.floor(vmin/interval) * interval;
        if (vstart < vmin) vstart += interval;
        return [vstart,interval];
    }

    var normal_style = 'rgb(0,0,0)'; // default drawing color
    var background_style = 'rgb(238,238,238)';
    var element_style = 'rgb(255,255,255)';
    var grid_style = "rgb(220,220,220)";
    var graph_font = '8pt sans-serif';
    var graph_legend_font = '10pt sans-serif';
    var value_font = '8pt Consolas,"Courier New",monospace';

    // dataseries is an array of objects that have the following attributes:
    //   xvalues: list of xcoord arrays
    //   yvalues: list of ycoord arrays
    //   name: list of signal names to use in legend (optional)
    //   color: list of colors to use when drawing graph
    //   xunits: string for labeling xvalues (optional)
    //   yunits: string for labeling yvalues (optional - if omitted assumed to be bits)
    //   xlabel: string for labeling x axis (optional)
    //   ylabel: string for labeling y axis (optional)
    //   add_plot: function(string) called when user wants to add a plot
    //   type: 'digital' or 'analog'
    function graph(dataseries) {
        // create container
        var container = $('<div class="plot-container noselect"></div>');
        container[0].dataseries = dataseries;
        dataseries.container = container[0];

        // add toolbar
        var toolbar = $('<div class="plot-toolbar"></div>');
        var zoom = $('<div class="plot-tool" id="zoom"></div>').html(zoom_icon);
        var zoomin = $('<div class="plot-tool plot-tool-enabled" id="zoomin"></div>').html(zoomin_icon);
        var zoomout = $('<div class="plot-tool" id="zoomout"></div>').html(zoomout_icon);
        var zoomsel = $('<div class="plot-tool" id="zoomsel"></div>').html(zoomsel_icon);

        /*
        var zoomin = $('<img class="plot-tool plot-tool-enabled" id="zoomin">').attr('src',zoomin_icon);
        var zoomout = $('<img class="plot-tool" id="zoomout">').attr('src',zoomout_icon);
        var zoomsel = $('<img class="plot-tool" id="zoomsel">').attr('src',zoomsel_icon);
         */
        toolbar.append(zoom,zoomin,zoomout,zoomsel);

        if (dataseries.add_plot) {
            toolbar.append('<div class="plot-tool-spacer"></div>Add plot: ');
            var add_plot = $('<input type="text" size="20" style="margin-bottom:0" id="add-plot">');
            toolbar.append(add_plot);

            add_plot.on('keypress',function (event) {
                if (event.which == 13) {
                    // call user to add plots to dataseries
                    dataseries.add_plot(add_plot.val());
                    // process any new datasets
                    $.each(dataseries,function (dindex,dataset) {
                        if (dataset.dataseries === undefined) 
                            process_dataset(dataset);
                    });
                    do_plot(container[0], container.width(), container.height());
                }
            });
        }

        container.append(toolbar);

        var waveforms = $('<div class="plot-waveforms"></div>');
        container.append(waveforms);

        // set up scroll bar
        container.append('<div class="plot-scrollbar-wrapper"><div class="plot-scrollbar"><div class="plot-scrollbar-thumb"></div></div></div>');

        // handlers for zoom tools
        zoom.on('click',function (event) {
            if (zoom.hasClass('plot-tool-enabled')) {
                dataseries.sel0 = undefined;   // remove selection
                dataseries.xstart = dataseries.xmin;
                dataseries.xend = dataseries.xmax;
                do_plot(container[0],container.width(),container.height());
                event.preventDefault();
            }
        });

        function do_zoom(xrange,plotx) {
            dataseries.sel0 = undefined;   // remove selection

            // if not specified, assume user wants xstart to remain unchanged
            if (plotx === undefined) plotx = dataseries[0].left;

            // choose xstart so that datax at pixel location plotx will
            // still be at location plotx after zooming in;
            var dataset = dataseries[0];  // any dataset will do, pick the first one
            var datax = dataset.datax(plotx); 
            // plotx = ((datax - xstart)/new_width)*wplot + left_margin
            // so solve for xstart given all the other values
            var xstart = datax - ((plotx - dataset.left)/dataset.wplot)*xrange;
            dataseries.xstart = Math.max(dataseries.xmin,xstart);
            dataseries.xend = dataseries.xstart + xrange;

            if (dataseries.xend > dataseries.xmax) {
                dataseries.xstart = Math.max(dataseries.xmin, dataseries.xstart-(dataseries.xend-dataseries.xmax));
                dataseries.xend = dataseries.xmax;
            }
            
            do_plot(container[0],container.width(),container.height());
        };

        zoomin.on('click',function (event) {
            if (zoomin.hasClass('plot-tool-enabled'))
                do_zoom((dataseries.xend - dataseries.xstart)/2);
            event.preventDefault();
        });

        zoomout.on('click',function (event) {
            if (zoomout.hasClass('plot-tool-enabled'))
                do_zoom((dataseries.xend - dataseries.xstart)*2);
            event.preventDefault();
        });

        zoomsel.on('click',function (event) {
            if (zoomsel.hasClass('plot-tool-enabled') && dataseries.sel0 && dataseries.sel1) {
                var x0 = dataseries[0].datax(dataseries.sel0);
                var x1 = dataseries[0].datax(dataseries.sel1);
                dataseries.xstart = Math.min(x0,x1);
                dataseries.xend = Math.max(x0,x1);
                dataseries.sel0 = undefined;   // all done with region!
                dataseries.sel1 = undefined;
                do_plot(container[0],container.width(),container.height());
            }
            event.preventDefault();
        });

        function process_dataset(dataset) {
            dataset.dataseries = dataseries;   // remember our parent

            // remember min and max xvalues across all the datasets:
            // look through xvalues for each node in the dataset
            $.each(dataset.xvalues,function (index,xvalues) {
                if (dataseries.xmin === undefined || xvalues[0] < dataseries.xmin)
                    dataseries.xmin = xvalues[0];
                if (dataseries.xmax === undefined || xvalues[xvalues.length - 1] > dataseries.xmax)
                    dataseries.xmax = xvalues[xvalues.length - 1];
            });

            // anotate each dataset with ymin and ymax
            var ymin,ymax;
            // if this is a real quantity (voltage, current), find max and min:
            // look through yvalues for each node in the dataset
            $.each(dataset.yvalues,function (dindex,yvalues) {
                if (dataset.type[dindex] == 'analog') {
                    $.each(yvalues,function (yindex, y) {
                        if (ymin === undefined || y < ymin) ymin = y;
                        if (ymax === undefined || y > ymax) ymax = y;
                    });
                }
            });
            if (ymin === undefined) { ymin = 0; ymax = 1; }  // digital waveform?

            // expand y range by 10% to leave a margin above and below the waveform
            if (ymin == ymax) {
                // deal with degenerate case...
                if (ymin === 0) { ymin = -0.5; ymax = 0.5; }
                else {
                    ymin = ymin > 0 ? 0.9 * ymin : 1.1 * ymin;
                    ymax = ymax > 0 ? 1.1 * ymax : 0.9 * ymax;
                }
            } else {
                var yextra = 0.2 * (ymax - ymin);
                ymin -= yextra;
                ymax += yextra;
            }
            dataset.ymin = ymin;
            dataset.ymax = ymax;

            // set up canvas for DOM, also one for background image
            dataset.canvas = $('<div class="plot-canvas"><svg></svg></div>');
            dataset.canvas[0].plot_dataset = dataset;  // for event processing
            dataset.svg = dataset.canvas[0].children.item(0);
            dataset.svg_waveform = jade.utils.make_svg('g');
            dataset.svg.appendChild(dataset.svg_waveform);
            dataset.svg_cursor = jade.utils.make_svg('g');
            dataset.svg.appendChild(dataset.svg_cursor);

            // handle click in close box
            dataset.canvas.on('click',function (event) {
                var pos = dataset.canvas.offset();
                var gx = event.pageX - pos.left;
                var gy = event.pageY - pos.top;

                if (gx >= 5.5 && gx <= 15.5 && gy >= 5.5 && gy <= 15.5) {
                    // remove dataset from DOM and dataseries
                    dataseries.splice(dataseries.indexOf(dataset),1);
                    dataset.canvas.remove();

                    // replot remaining datasets
                    do_plot(container[0],container.width(),container.height());
                    event.preventDefault();
                }
            });

            // double-click zooms in, shift double-click zooms out
            dataset.canvas.on('dblclick',function (event) {
                var pos = dataset.canvas.offset();
                var gx = event.pageX - pos.left;
                var gy = event.pageY - pos.top;

                if (gx >= dataset.left && gx <= dataset.left + dataset.wplot &&
                    gy >= dataset.top && gy <= dataset.top + dataset.hplot) {
                    var xrange = dataset.dataseries.xend - dataset.dataseries.xstart;
                    if (event.shiftKey) do_zoom(xrange*2,gx);
                    else do_zoom(xrange/2,gx);
                    event.preventDefault();
                }
            });

            // use arrow keys to pan (ie, move the scrollbar thumb)  [doesn't work?]
            dataset.canvas.on('mouseenter',function (event) { dataset.canvas.focus(); });
            dataset.canvas.on('mouseleave',function (event) { dataset.canvas.blur(); });
            dataset.canvas.on('keypress',function (event) {
                if (event.which == 37) move_thumb(1);
                else if (event.which == 39) move_thumb(-1);
                else return;
                event.prevent_default();
            });

            // use mouse wheel to pan (ie, move the scrollbar thumb)
            dataset.canvas.on('mousewheel',function (event) {
                var pos = dataset.canvas.offset();
                var gx = event.pageX - pos.left;
                var gy = event.pageY - pos.top;

                if (gx >= dataset.left && gx <= dataset.left + dataset.wplot &&
                    gy >= dataset.top && gy <= dataset.top + dataset.hplot) {
                    event.preventDefault();
                    move_thumb(event.originalEvent.wheelDelta > 0 ? -1 : 1);
                    event.preventDefault();
                }
            });

            // dragging in plot creates a selection region
            dataset.canvas.on('mousedown',function (event) {
                var pos = dataset.canvas.offset();
                var gx = event.pageX - pos.left;
                var gy = event.pageY - pos.top;

                // see if mouse is over plot region
                if (gx >= dataset.left && gx <= dataset.left + dataset.wplot &&
                    gy >= dataset.top && gy <= dataset.top + dataset.hplot) {
                    dataseries.sel0 = dataseries.cursor;   // remember start of region
                    dataseries.sel1 = undefined;
                    dataseries.sel = true;
                    event.preventDefault();
                }

                $(document).on('mouseup',function (event) {
                    $(document).unbind('mouseup');
                    dataseries.sel = undefined;      // we're done defining region
                    graph_redraw(dataseries);
                    event.preventDefault();
                });

            });

            // track mouse to display vertical cursor & measurements
            dataset.canvas.on('mousemove',function (event) {
                var pos = dataset.canvas.offset();
                var gx = event.pageX - pos.left;
                var gy = event.pageY - pos.top;

                // see if mouse is over plot region
                if (gx >= dataset.left && gx <= dataset.left + dataset.wplot &&
                    gy >= dataset.top && gy <= dataset.top + dataset.hplot) {
                    dataseries.cursor = Math.floor(gx) + 0.5;
                    if (dataseries.sel) dataseries.sel1 = dataseries.cursor;
                    graph_redraw(dataseries);
                    event.preventDefault();
                } else if (dataseries.cursor) {
                    dataseries.cursor = undefined;
                    graph_redraw(dataseries);
                }
            });

            waveforms.append(dataset.canvas);
        }

        // compute value bounds, set up canvas
        $.each(dataseries,function (index,dataset) { process_dataset(dataset); });
        dataseries.xstart = dataseries.xmin;   // set up initial xaxis bounds
        dataseries.xend = dataseries.xmax;
        dataseries.cursor = undefined;    // x-coord of mouse cursor over plot

        // set up handlers for dragging scrollbar thumb
        var thumb = container.find('.plot-scrollbar-thumb');
        var scrollbar = container.find('.plot-scrollbar');

        function move_thumb(dx) {
            if (thumb.is(':hidden')) return;

            var thumb_dx = (dataseries.xmax - dataseries.xmin)/scrollbar.width();
            var width = dataseries.xend - dataseries.xstart;
            dataseries.xstart = Math.max(dataseries.xmin,dataseries.xstart + dx*thumb_dx);
            dataseries.xend = dataseries.xstart + width;

            if (dataseries.xend > dataseries.xmax) {
                dataseries.xend = dataseries.xmax;
                dataseries.xstart = dataseries.xend - width;
            }

            thumb.css('margin-left',(dataseries.xstart - dataseries.xmin)/thumb_dx);

            // replot after changing visible region
            $.each(dataseries,function (index,dataset) {
                dataset_plot(dataset);
            });
            graph_redraw(dataseries);
        }

        // click on thumb doesn't count as click on scroll bar
        thumb.on('click',function (event) {
            event.stopPropagation();
        });

        scrollbar.on('click',function (event) {
            var mx = event.pageX - thumb.offset().left;
            var w = 0.8 * thumb.width();
            move_thumb(mx < 0 ? -w : w);
            event.preventDefault();
        });

        thumb.on('mousedown',function (event) {
            var mx = event.pageX;

            $(document).on('mousemove',function (event) {
                move_thumb(event.pageX - mx);
                mx = event.pageX;
                event.preventDefault();
            });

            $(document).on('mouseup',function (event) {
                $(document).unbind('mousemove');
                $(document).unbind('mouseup');
                event.preventDefault();
            });

            event.preventDefault();
        });

        // set up resize handler
        container[0].resize = do_plot;

        // the initial plot
        do_plot(container[0], 400, 300);

        return container[0];
    }

    function do_plot(container,w,h) {
        var dataseries = container.dataseries;

        // set dimensions of each canvas, figure out consistent margins
        var left_margin = 55.5;
        var right_margin = 19.5;
        var top_margin = 5.5;
        var bottom_margin = 15.5;

        w = Math.max(150 + left_margin + right_margin,w);
        var plot_h = Math.max(30 + top_margin + bottom_margin,
                              Math.floor((h - 60)/dataseries.length));  // height of each plot

        $(container).width(w);
        $(container).height(h);
        $('.plot-waveforms',container).height(h - 60);

        $.each(dataseries,function (index,dataset) {
            dataset.canvas.width(w);
            dataset.canvas.height(plot_h);

            if (dataset.ylabel !== undefined) left_margin = 70.5;
            if (dataset.xlabel !== undefined) bottom_margin = 35.5;
        });

        $(container).find('.plot-scrollbar').css('margin-left',left_margin).css('margin-right',right_margin);

        // now that dimensions are set, do the plots
        var wplot = w - left_margin - right_margin;
        var hplot = plot_h - top_margin - bottom_margin;
        var xscale = (dataseries.xend - dataseries.xstart)/wplot;
        $.each(dataseries,function (index,dataset) {
            // set up coordinate transforms
            var yscale = (dataset.ymax - dataset.ymin)/hplot;
            dataset.plotx = function(datax) {
                return (datax - dataseries.xstart)/xscale + left_margin;
            };
            dataset.ploty = function(datay) {
                return top_margin + (hplot - (datay - dataset.ymin)/yscale);
            };
            dataset.datax = function(plotx) {
                return (plotx - left_margin)*xscale + dataseries.xstart;
            };

            // save margin and size info
            dataset.left = left_margin;
            dataset.top = top_margin;
            dataset.wplot = wplot;
            dataset.hplot = hplot;
            dataset.max_x = left_margin + wplot;

            // draw the plot
            dataset_plot(dataset);
        });
        graph_redraw(dataseries);

        // set up toolbar
        var maxzoom = (dataseries.xstart == dataseries.xmin && dataseries.xend == dataseries.xmax);
        $(container).find('#zoom').toggleClass('plot-tool-enabled',!maxzoom);
        $(container).find('#zoomout').toggleClass('plot-tool-enabled',!maxzoom);

        // set up scrollbar
        $(container).find('.plot-scrollbar-thumb').toggle(!maxzoom);
        if (!maxzoom) {
            var thumb = $(container).find('.plot-scrollbar-thumb');
            var scale = (dataseries.xmax - dataseries.xmin)/wplot;
            var wthumb = (dataseries.xend - dataseries.xstart)/scale;
            var xthumb = (dataseries.xstart - dataseries.xmin)/scale;
            thumb.css('width',wthumb);
            thumb.css('margin-left',xthumb);
        }
    }

    // redraw the plot for a particular dataset
    function dataset_plot(dataset) {
        var xstart = dataset.dataseries.xstart;
        var xend = dataset.dataseries.xend;

        // compute info for drawing grids -- shoot for a grid line every 100 pixels
        var xtick = tick_interval(xstart,xend,dataset.wplot/100);
        xtick.push(xend);  // when to stop drawing x grid
        var ytick = tick_interval(dataset.ymin,dataset.ymax,dataset.hplot/100);
        var tick_length = 5;

        // start by painting an opaque background for the plot itself
        $(dataset.svg_waveform).empty();

        var msvg = jade.utils.make_svg;
        var mtxt = jade.utils.svg_text;

        function wadd(tag,attr) {
            dataset.svg_waveform.appendChild(msvg(tag,attr));
        }

        wadd('rect',{x: dataset.left, y:dataset.top,
                     width: dataset.wplot, height: dataset.hplot,
                     fill: element_style});

        // for grid and labels
        var svg = jade.utils.make_svg('g',{
            stroke: grid_style,
            fill: normal_style,
            style: 'font: ' + graph_font
        });
        dataset.svg_waveform.appendChild(svg);

        // draw xgrid and tick labels
        var t,temp,t2;
        var xunits = dataset.xunits || '';
        for (t = xtick[0]; t < xtick[2]; t += xtick[1]) {
            temp = Math.floor(dataset.plotx(t)) + 0.5;
            t2 = dataset.top + dataset.hplot;
            svg.appendChild(msvg('line',{x1:temp, y1: dataset.top, x2: temp, y2: t2}));
            svg.appendChild(mtxt(jade.utils.engineering_notation(t, 2)+xunits,temp, t2,
                                'center','top'));
        }

        // draw ygrid and tick labels
        var yunits = dataset.yunits || '';
        for (t = ytick[0]; t < dataset.ymax; t += ytick[1]) {
            temp = Math.floor(dataset.ploty(t)) + 0.5;
            t2 = dataset.left + dataset.wplot;
            svg.appendChild(msvg('line',{x1: dataset.left, y1: temp, x2: t2, y2: temp}));
            svg.appendChild(mtxt(jade.utils.engineering_notation(t, 2)+yunits,dataset.left-2,temp,
                                'right','middle'));
        }

        // draw axis labels
        if (dataset.xlabel) {
            svg.appendChild(mtxt(dataset.xlabel,dataset.left + dataset.wplot/2, dataset.hplot+20,
                                 'center','top',{style: 'font: ' + graph_legend_font}));
        }
        if (dataset.ylabel) {
            temp = dataset.top + dataset.hplot/2,
            svg.appendChild(mtxt(dataset.ylabel,10,temp,'middle','top',{
                transform: 'rotate(270 10 '+temp.toString()+')',
                style: 'font: ' + graph_legend_font
            }));
        }

        // for waveforms
        svg = jade.utils.make_svg('g',{
            'stroke-width': 2,
            'style': 'clip: ' + make_clip(dataset.left,dataset.top,dataset.wplot,dataset.hplot)
        });
        dataset.svg_waveform.appendChild(svg);

        // we need a separate plot for each node in the dataset
        for (var dindex = 0; dindex < dataset.xvalues.length; dindex += 1) {
            var xvalues = dataset.xvalues[dindex];
            var yvalues = dataset.yvalues[dindex];
            var i = search(xvalues,xstart);  // quickly find first index
            var xv = xvalues[i];
            var x,y,y0,y1;

            var color = dataset.color[dindex] || '#268bd2';
            var nx,ny;
            if (dataset.type[dindex] == 'analog') {
                // plot the analog waveform
                x = dataset.plotx(xv);
                y = dataset.ploty(yvalues[i]);
                while (xv <= xend) {
                    i += 1;
                    if (i > xvalues.length) break;
                    xv = xvalues[i];
                    if (xv === undefined) break;
                    nx = dataset.plotx(xv);
                    ny = dataset.ploty(yvalues[i]);

                    // do our own clipping until we can get SVG to do it for us?
                    if (x != nx) {
                        var slope = (ny - y)/(nx - x);
                        if (x < dataset.left) {
                            y += slope*(dataset.left - x);
                            x = dataset.left;
                        }
                        if (nx > dataset.max_x) {
                            ny += slope*(nx - dataset.max_x);
                            nx = dataset.max_x;
                        }
                    }

                    svg.appendChild(msvg('line',{x1:x, y1:y, x2: nx, y2: ny,
                                                 stroke: color}));
                    x = nx;
                    y = ny;
                }
            } else if (dataset.type[dindex] == 'digital') {
                // plot the digital waveform
                y0 = dataset.ploty(0);
                y1 = dataset.ploty(1);
                var yz = (y0 + y1)/2;

                x = dataset.plotx(xv);
                y = yvalues[i];
                while (xv <= xend) {
                    i += 1;
                    if (i > xvalues.length) break;
                    xv = xvalues[i];
                    if (xv === undefined) break;
                    nx = dataset.plotx(xv);

                    // can't get clip: to work???
                    if (x < dataset.left) x = dataset.left;
                    if (nx > dataset.max_x) nx = dataset.max_x;

                    if (y != 2) {   // 0, 1, Z values are lines
                        y = (y==0) ? y0 : ((y==1) ? y1 : yz);
                        svg.appendChild(msvg('line',{x1:x, y1: y, x2:nx, y2: y, stroke: color}));
                    } else {        // X values are filled rectangles
                        svg.appendChild(msvg('rect',{x:x, y: y1, width:nx-x, height: y0-y1,
                                                     stroke: color, fill: color}));
                    }

                    x = nx;
                    y = yvalues[i];
                }
            } else if (dataset.type[dindex] == 'string') {
                // like digital except that value is a string
                y0 = dataset.ploty(0);
                y1 = dataset.ploty(1);
                var ylabel = (y0 + y1)/2;
                var w;

                var style = 'font: ' + value_font;

                x = dataset.plotx(xv);
                y = yvalues[i];
                var xcenter;
                while (xv <= xend) {  // stop at end of plot window
                    i += 1;
                    if (i > xvalues.length) break;  // past end of data...
                    xv = xvalues[i];
                    if (xv === undefined) break;
                    nx = dataset.plotx(xv);
                    xcenter = (nx + x)/2;

                    if (x < dataset.left) x = dataset.left;
                    if (nx > dataset.max_x) nx = dataset.max_x;  // poor-man's clipping

                    if (typeof y == 'number') {  // indicates a Z value
                        svg.append(msvg('line',{x1:x, y1:ylabel, x2:nx, y2:ylabel,
                                                stroke: color,
                                                'stroke-width':1}));
                    } else {
                        svg.append(msvg('rect',{x:x, y:y1, width:nx-x, height:y0-y1,
                                                stroke: color,
                                                'stroke-width':1,
                                                fill: (y === undefined) ? color : 'none'
                                               }));
                        if (y !== undefined) {
                            // center in visible portion of waveform
                            var x0 = x; //Math.max(dataset.left,x);
                            var x1 = nx; //Math.min(dataset.max_x,nx);
                            // rough check to see if label fits...
                            if (xcenter > x && xcenter < nx && x1-x0 > 6*y.length) {
                                svg.append(mtxt(y,(x0+x1)/2,ylabel,'center','middle',{
                                    style: style,
                                    'clip': make_clip(x0,y0,x1-x0,y0-y1),
                                    fill: color
                                }));
                            }
                        }
                    }

                    x = nx;
                    y = yvalues[i];
                }
            }
        }

        wadd('rect',{x: dataset.left, y:dataset.top,
                     width: dataset.wplot, height: dataset.hplot,
                     fill: 'none', stroke: normal_style});

        wadd('path',{d: "M 5.5 5.5 l 10 0 l 0 10 l -10 0 l 0 -10 l 10 10 m -10 0 l 10 -10",
                     fill: 'none', stroke: normal_style});

        // add legend: translucent background with 5px padding, 10x10 color key, signal label
        var left = dataset.left;
        var top = dataset.top;
        dataset.legend_right = [];
        dataset.legend_top = [];
        for (var dindex = 0; dindex < dataset.xvalues.length; dindex += 1) {
            var w = 6*dataset.name[dindex].length;
            
            wadd('rect',{x:left, y:top, width: w+30, height: 20,
                         fill: element_style, stroke: 'none',
                         opacity: 0.8});

            wadd('rect',{x:left+5, y:top+5, width: 10, height: 10,
                         fill: dataset.color[dindex], stroke: 'none'});

            dataset.svg_waveform.appendChild(
                mtxt(dataset.name[dindex],left+20,top+10,'left','middle',
                     {style: 'font: ' + value_font,
                      fill: normal_style}));

            // remember where legend ends so we can add cursor readout later
            dataset.legend_right.push(left + 20 + w);
            dataset.legend_top.push(top);
            top += 15;
        }
    }

    function graph_redraw(dataseries) {
        $(dataseries.container).find('#zoomsel').toggleClass('plot-tool-enabled',dataseries.sel0!==undefined && dataseries.sel1!==undefined);
        var msvg = jade.utils.make_svg;
        var mtxt = jade.utils.svg_text;

        // redraw each plot with cursor overlay
        $.each(dataseries,function(index,dataset) {
            var svg = dataset.svg_cursor;
            $(svg).empty();

            // show selection region, if any
            if (dataseries.sel0 && dataseries.sel1) {
                var xsel = Math.min(dataseries.sel0,dataseries.sel1);
                var wsel = Math.abs(dataseries.sel0 - dataseries.sel1);
                svg.appendChild(msvg('rect',{x:xsel, y:dataset.top, width: wsel, height:dataset.hplot,
                                             fill: 'rgb(207,191,194)',
                                             stroke: 'rgb(207,191,194)',
                                             opacity: 0.4}));

                if (dataseries.sel0 !== dataseries.sel1) {
                    var delta = Math.abs(dataset.datax(dataseries.sel0) - dataset.datax(dataseries.sel1));
                    var v = jade.utils.engineering_notation(delta,3);
                    var w = 6*v.length + 18;
                    svg.appendChild(msvg('rect',{x:xsel+wsel, y:dataset.top, width: w, height:12,
                                                 fill: 'black'}));
                    svg.appendChild(mtxt('dx='+v,xsel+wsel,dataset.top,'left','top',
                                         {fill: 'white', style: 'font: '+value_font}));
                }
            }

            if (dataseries.cursor !== undefined) {
                svg.appendChild(msvg('line',{x1:dataseries.cursor, y1: dataset.top,
                                             x2:dataseries.cursor, y1: dataset.top + dataset.hplot,
                                             'stroke-width': 1,
                                             stroke: normal_style}));

                // add x-axis label
                var x = dataset.datax(dataseries.cursor);  // convert cursor coord to x value
                var label = jade.utils.engineering_notation(x,4);
                if (dataset.xunits) label += dataset.xunits;
                svg.appendChild(mtxt('\u2588\u2588\u2588\u2588\u2588\u2588',
                                     dataseries.cursor,dataset.top+dataset.hplot+1,
                                     'center','top',{
                                         style: 'font: ' + graph_font,
                                         fill: background_style
                                     }));
                svg.appendChild(mtxt(label,dataseries.cursor,dataset.top+dataset.hplot,
                                     'center','top',{
                                         style: 'font: ' + graph_font,
                                         fill: normal_style
                                     }));

                // draw fiducial at intersection of cursor and curve
                if (dataset.type[0] == 'analog') {
                    for (var dindex = 0; dindex < dataset.xvalues.length; dindex += 1) {
                        var xvalues = dataset.xvalues[dindex];
                        var yvalues = dataset.yvalues[dindex];
                        var i = search(xvalues,x);  // quickly find first index
                        // interpolate cursor's intersection with curve
                        var x1 = xvalues[i];
                        var y1 = yvalues[i];
                        var x2 = xvalues[i+1] || x1;
                        var y2 = yvalues[i+1] || y1;
                        var y = y1;
                        if (x1 != x2) y = y1 + ((x - x1)/(x2-x1))*(y2 - y1);

                        var gx = dataset.plotx(x);
                        var gy = dataset.ploty(y);
                        svg.appendChild(msvg('circle',{cx: gx, cy: gy, r: 5,
                                                       fill: 'none',
                                                       stroke: dataset.color[dindex] || '#268bd2'}));

                        // add y value readout in legend
                        var lx = dataset.legend_right[dindex];
                        var ly = dataset.legend_top[dindex];
                        label = '='+jade.utils.engineering_notation(y,2) + dataset.yunits;
                        w = 6 * label.length;

                        // translucent background so graph doesn't obscure label
                        svg.appendChild(msvg('rect',{x:lx, y:ly, width:w+5, height:20,
                                                     fill: element_style, opacity:0.7}));

                        // now plot the label itself
                        svg.appendChild(mtxt(label,lx,ly+10,'left','middle',{
                            style: 'font: '+ value_font,
                            fill: normal_style
                        }));
                    }
                }
            }
        });
    }

    // find largest index in array such that array[index] <= val
    // return 0 if all array elements are >= val
    // assumes array contents are in increasing order
    // uses a binary search
    function search(array, val) {
        var start = 0;
        var end = array.length-1;
        var index;
        while (start < end) {
            index = (start + end) >> 1;   // "middle" index
            if (index == start) index = end;
            if (array[index] <= val) start = index;
            else end = index - 1;
        }
        return start;
    }

    // build css clip specification
    function make_clip(x,y,w,h) {
        // top, right, bottom, left
        return 'rect(' + y.toString() + 'px ' + (x+w).toString() + 'px ' +
             (y+h).toString() + 'px ' + x.toString() + 'px)';
    }

    var zoom_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
            '<line x1="9" y1="9" x2="15" y2="15" stroke="black" stroke-width="3"/>' +
            '<circle cx="6" cy="6" r="5.5" stroke="black" stroke-width="1" fill="#CCCCCC"/>' +
            '</svg>';

    var zoomin_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
            '<line x1="9" y1="9" x2="15" y2="15" stroke="black" stroke-width="3"/>' +
            '<circle cx="6" cy="6" r="5.5" stroke="black" stroke-width="1" fill="#CCCCCC"/>' +
            '<path d="M 3 6 l 6 0 m -3 -3 l 0 6" stroke="black" stroke-width="1"/>' +
            '</svg>';
    
    var zoomout_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
            '<line x1="9" y1="9" x2="15" y2="15" stroke="black" stroke-width="3"/>' +
            '<circle cx="6" cy="6" r="5.5" stroke="black" stroke-width="1" fill="#CCCCCC"/>' +
            '<path d="M 3 6 l 6 0" stroke="black" stroke-width="1"/>' +
            '</svg>';

    var zoomsel_icon = '<svg width="16" height="16" viewBox="0 0 16 16">' +
            '<line x1="9" y1="9" x2="15" y2="15" stroke="black" stroke-width="3"/>' +
            '<circle cx="6" cy="6" r="5.5" stroke="black" stroke-width="1" fill="#CCCCCC"/>' +
            '<path d="M 3 3 l 2 0 m 2 0 l 2 0 l 0 2 m 0 2 l 0 2 l -2 0 m -2 0 l -2 0 l 0 -2 m 0 -2 l 0 -2" stroke="black" stroke-width="1"/>' +
            '</svg>';

    // module exports
    return {
        graph: graph,
        tick_interval: tick_interval
        //engineering_notation: engineering_notation
    };
};
