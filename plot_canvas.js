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
        var zoom = $('<img class="plot-tool" id="zoom">').attr('src',zoom_icon);
        var zoomin = $('<img class="plot-tool plot-tool-enabled" id="zoomin">').attr('src',zoomin_icon);
        var zoomout = $('<img class="plot-tool" id="zoomout">').attr('src',zoomout_icon);
        var zoomsel = $('<img class="plot-tool" id="zoomsel">').attr('src',zoomsel_icon);
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
            dataset.canvas = $('<canvas class="plot-canvas"></canvas>');
            dataset.canvas[0].plot_dataset = dataset;  // for event processing

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

            dataset.bg_image = $('<canvas></canvas>');

            // handle retina devices properly
            var context = dataset.canvas[0].getContext('2d');
            var devicePixelRatio = window.devicePixelRatio || 1;
            var backingStoreRatio = context.webkitBackingStorePixelRatio ||
                    context.mozBackingStorePixelRatio ||
                    context.msBackingStorePixelRatio ||
                    context.oBackingStorePixelRatio ||
                    context.backingStorePixelRatio || 1;
            dataset.pixelRatio = devicePixelRatio / backingStoreRatio;

            waveforms.append(dataset.canvas);
            //dataset.canvas.insertBefore(container.find('.plot-scrollbar-wrapper'));

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
            dataset.canvas[0].width = w*dataset.pixelRatio;
            dataset.canvas[0].height = plot_h*dataset.pixelRatio;
            // after changing dimension, have to reset context 
            dataset.canvas[0].getContext('2d').scale(dataset.pixelRatio,dataset.pixelRatio);

            dataset.bg_image[0].width = w*dataset.pixelRatio;
            dataset.bg_image[0].height = plot_h*dataset.pixelRatio;
            dataset.bg_image[0].getContext('2d').scale(dataset.pixelRatio,dataset.pixelRatio);

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

    // redraw the plot for a particular dataset by filling in background image
    function dataset_plot(dataset) {
        var xstart = dataset.dataseries.xstart;
        var xend = dataset.dataseries.xend;

        // compute info for drawing grids -- shoot for a grid line every 100 pixels
        var xtick = tick_interval(xstart,xend,dataset.wplot/100);
        xtick.push(xend);  // when to stop drawing x grid
        var tick_length = 5;

        // start by painting an opaque background for the plot itself
        var c = dataset.bg_image[0].getContext('2d');

        c.clearRect(0, 0, dataset.bg_image[0].width, dataset.bg_image[0].height);

        c.fillStyle = element_style;
        c.fillRect(dataset.left, dataset.top, dataset.wplot, dataset.hplot);

        // draw xgrid and tick labels
        c.strokeStyle = grid_style;
        c.fillStyle = normal_style;
        c.font = graph_font;
        c.textAlign = 'center';
        c.textBaseline = 'top';
        var t,temp;
        var xunits = dataset.xunits || '';
        for (t = xtick[0]; t < xtick[2]; t += xtick[1]) {
            temp = Math.floor(dataset.plotx(t)) + 0.5;

            c.beginPath();
            c.moveTo(temp,dataset.top); c.lineTo(temp,dataset.top + dataset.hplot);
            c.stroke();
            c.fillText(jade.utils.engineering_notation(t, 2)+xunits, temp, dataset.top + dataset.hplot);
        }

        var ytick = tick_interval(dataset.ymin,dataset.ymax,dataset.hplot/100);
        // draw ygrid and tick labels
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        for (t = ytick[0]; t < dataset.ymax; t += ytick[1]) {
            temp = Math.floor(dataset.ploty(t)) + 0.5;
            
            c.beginPath();
            c.moveTo(dataset.left,temp); c.lineTo(dataset.left + dataset.wplot,temp);
            c.stroke();
            c.fillText(jade.utils.engineering_notation(t, 2)+dataset.yunits,dataset.left-2,temp);
        }

        // draw axis labels
        c.font = graph_legend_font;
        if (dataset.xlabel) {
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillText(dataset.xlabel, dataset.left + dataset.wplot/2, dataset.bg_image[0].height-5);
        }
        if (dataset.ylabel) {
            c.save();
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.translate(10, dataset.top + dataset.hplot/2);
            c.rotate(-Math.PI / 2);
            c.fillText(dataset.ylabel, 0, 0);
            c.restore();
        }

        c.save();
        c.beginPath();
        c.rect(dataset.left,dataset.top,dataset.wplot,dataset.hplot);
        c.clip();   // clip waveform plot to waveform region of canvas
        // we need a separate plot for each node in the dataset
        for (var dindex = 0; dindex < dataset.xvalues.length; dindex += 1) {
            var xvalues = dataset.xvalues[dindex];
            var yvalues = dataset.yvalues[dindex];
            var i = search(xvalues,xstart);  // quickly find first index
            var xv = xvalues[i];
            var x,y,y0,y1;

            c.strokeStyle = dataset.color[dindex] || '#268bd2';
            c.fillStyle = c.strokeStyle;
            c.lineWidth = 2;

            if (dataset.type[dindex] == 'analog') {
                // plot the analog waveform
                x = dataset.plotx(xv);
                y = dataset.ploty(yvalues[i]);
                c.beginPath();
                c.moveTo(x, y);
                while (xv <= xend) {
                    i += 1;
                    if (i > xvalues.length) break;
                    xv = xvalues[i];
                    if (xv === undefined) break;
                    var nx = dataset.plotx(xv);
                    var ny = dataset.ploty(yvalues[i]);
                    c.lineTo(nx, ny);
                    x = nx;
                    y = ny;
                    if (i % 100 == 99) {
                        // too many lineTo's cause canvas to break
                        c.stroke();
                        c.beginPath();
                        c.moveTo(x, y);
                    }
                }
                c.stroke();
            } else if (dataset.type[dindex] == 'digital') {
                // plot the digital waveform
                y0 = dataset.ploty(0);
                y1 = dataset.ploty(1);
                var yz = (y0 + y1)/2;

                x = dataset.plotx(xv);
                y = yvalues[i];
                c.beginPath();
                while (xv <= xend) {
                    i += 1;
                    if (i > xvalues.length) break;
                    xv = xvalues[i];
                    if (xv === undefined) break;
                    var nx = dataset.plotx(xv);

                    if (y != 2) {   // 0, 1, Z values are lines
                        y = (y==0) ? y0 : ((y==1) ? y1 : yz);
                        c.moveTo(x,y);
                        c.lineTo(nx,y);
                    } else {        // X values are filled rectangles
                        c.rect(x,y0,nx-x,y1-y0);
                    }

                    x = nx;
                    y = yvalues[i];
                    if (i % 100 == 99) {
                        // too many lineTo's cause canvas to break
                        c.stroke();
                        c.fill();
                        c.beginPath();
                    }
                }

                // draw any remaining path
                c.stroke();
                c.fill();
            } else if (dataset.type[dindex] == 'string') {
                // like digital except that value is a string
                y0 = dataset.ploty(0);
                y1 = dataset.ploty(1);
                var ylabel = (y0 + y1)/2;
                var w;

                c.font = value_font;
                c.lineWidth = 1;
                c.textAlign = 'center';
                c.textBaseline = 'middle';

                x = dataset.plotx(xv);
                y = yvalues[i];
                while (xv <= xend) {  // stop at end of plot window
                    i += 1;
                    if (i > xvalues.length) break;  // past end of data...
                    xv = xvalues[i];
                    if (xv === undefined) break;
                    var nx = dataset.plotx(xv);

                    if (typeof y == 'number') {  // indicates a Z value
                        c.beginPath();
                        c.moveTo(x,ylabel);
                        c.lineTo(nx,ylabel);
                        c.stroke();
                    } else {
                        c.strokeRect(x,y0,nx-x,y1-y0);
                        if (y === undefined) c.fillRect(x,y0,nx-x,y1-y0);
                        else {
                            // fill in value label if it fits
                            w = c.measureText(y).width;
                            // center in visible portion of waveform
                            var x0 = Math.max(dataset.left,x);
                            var x1 = Math.min(dataset.left + dataset.wplot,nx);
                            if (w < x1 - x0) c.fillText(y,(x0 + x1)/2,ylabel);
                        }
                    }

                    x = nx;
                    y = yvalues[i];
                }
            }
        }
        c.restore();

        // add plot border last so it's on top
        c.lineWidth = 1;
        c.strokeStyle = normal_style;
        c.strokeRect(dataset.left, dataset.top, dataset.wplot, dataset.hplot);

        // add close box
        c.strokeRect(5.5,5.5,10,10);
        c.beginPath();
        c.moveTo(7.5,7.5); c.lineTo(13.5,13.5);
        c.moveTo(13.5,7.5); c.lineTo(7.5,13.5);
        c.stroke();

        // add legend: translucent background with 5px padding, 10x10 color key, signal label
        var left = dataset.left;
        var top = dataset.top;
        dataset.legend_right = [];
        dataset.legend_top = [];
        for (var dindex = 0; dindex < dataset.xvalues.length; dindex += 1) {
            var w = c.measureText(dataset.name[dindex]).width;
            c.globalAlpha = 0.7;
            c.fillStyle = element_style;
            c.fillRect(left, top, w + 30, 20);
            c.globalAlpha = 1.0;

            c.fillStyle = dataset.color[dindex];
            c.fillRect(left+5, top+5, 10, 10);
            c.strokeRect(left+5, top+5, 10, 10);

            c.fillStyle = normal_style;
            c.textAlign = 'left';
            c.textBaseline = 'bottom';
            c.fillText(dataset.name[dindex], left + 20, top+18);

            // remember where legend ends so we can add cursor readout later
            dataset.legend_right.push(left + 20 + w);
            dataset.legend_top.push(top);
            top += 15;
        }
    }

    function graph_redraw(dataseries) {
        $(dataseries.container).find('#zoomsel').toggleClass('plot-tool-enabled',dataseries.sel0!==undefined && dataseries.sel1!==undefined);

        // redraw each plot with cursor overlay
        $.each(dataseries,function(index,dataset) {
            var c = dataset.canvas[0].getContext('2d');
            c.clearRect(0, 0, dataset.canvas.width(), dataset.canvas.height());
            c.drawImage(dataset.bg_image[0], 0, 0, dataset.canvas.width(), dataset.canvas.height());

            // show selection region, if any
            if (dataseries.sel0 && dataseries.sel1) {
                c.fillStyle = 'rgba(207,191,194,0.4)';
                var xsel = Math.min(dataseries.sel0,dataseries.sel1);
                var wsel = Math.abs(dataseries.sel0 - dataseries.sel1);
                c.fillRect(xsel,dataset.top,wsel,dataset.hplot);

                c.strokeStyle = 'rgba(207,191,194,0.8)';
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(xsel,dataset.top); c.lineTo(xsel,dataset.top+dataset.hplot);
                c.moveTo(xsel+wsel,dataset.top); c.lineTo(xsel+wsel,dataset.top+dataset.hplot);
                c.stroke();

                if (dataseries.sel0 !== dataseries.sel1) {
                    var delta = Math.abs(dataset.datax(dataseries.sel0) - dataset.datax(dataseries.sel1));
                    var v = jade.utils.engineering_notation(delta,3);
                    c.font = value_font;
                    c.textAlign = 'right';
                    c.textBaseline = 'top';
                    c.fillStyle = 'rgb(0,0,0)';
                    var background = '';
                    for (var i = 0; i < v.length+5; i += 1) background += '\u2588';
                    c.fillText(background,xsel+wsel,dataset.top);
                    c.fillStyle = 'rgb(255,255,255)'; //'rgb(207,191,194)';
                    c.fillText('dx='+v+' ',xsel+wsel,dataset.top);
                }
            }

            if (dataseries.cursor !== undefined) {
                // overlay vertical plot cursor
                c.lineWidth = 1;
                c.strokeStyle = normal_style;
                c.beginPath();
                c.moveTo(dataseries.cursor,dataset.top);
                c.lineTo(dataseries.cursor,dataset.top + dataset.hplot);
                c.stroke();

                var x = dataset.datax(dataseries.cursor);  // convert cursor coord to x value

                // add x-axis label
                var label = jade.utils.engineering_notation(x,4);
                if (dataset.xunits) label += dataset.xunits;
                c.font = graph_font;
                c.textAlign = 'center';
                c.textBaseline = 'top';
                c.fillStyle = background_style;
                c.fillText('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588', dataseries.cursor, dataset.top + dataset.hplot);
                c.fillStyle = normal_style;
                c.fillText(label, dataseries.cursor, dataset.top + dataset.hplot);

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
                        c.strokeStyle = dataset.color[dindex] || '#268bd2';
                        c.beginPath();
                        c.arc(gx,gy,5,0,2*Math.PI);
                        c.stroke();

                        // add y value readout in legend
                        var lx = dataset.legend_right[dindex];
                        var ly = dataset.legend_top[dindex];
                        label = '='+jade.utils.engineering_notation(y,2) + dataset.yunits;
                        c.font = graph_legend_font;

                        // translucent background so graph doesn't obscure label
                        var w = c.measureText(label).width;
                        c.fillStyle = element_style;
                        c.globalAlpha = 0.7;
                        c.fillRect(lx,ly,w+5,20);

                        // now plot the label itself
                        c.textAlign = 'left';
                        c.textBaseline = 'bottom';
                        c.fillStyle = normal_style;
                        c.globalAlpha = 1.0;
                        c.fillText(label,lx,ly+18);
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

    var zoom_icon = 'data:image/gif;base64,R0lGODlhEAAQAMT/AAAAAP///zAwYT09bpGRqZ6et5iYsKWlvbi40MzM5cXF3czM5OHh5tTU2fDw84uMom49DbWKcfLy8g0NDcDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAABQALAAAAAAQABAAAAVZICWOZFlOwCQF5pg2TDMJbDs1DqI8g2TjOsSC0DMBGEGF4UAz3RQ6wiFRLEkmj8WyUC0FBAMpNdWiBCQD8DWCKq98lEkEAiiTAJB53S7Cz/kuECuAIzWEJCEAIf5PQ29weXJpZ2h0IDIwMDAgYnkgU3VuIE1pY3Jvc3lzdGVtcywgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLg0KSkxGIEdSIFZlciAxLjANCgA7';

    var zoomin_icon = 'data:image/gif;base64,R0lGODlhEAAQAMT/AAAAAP///zAwYT09boSEnIqKopiYsJ6etqurxL+/18XF3dnZ8sXF0OHh5tTU2ePj5piZr2EwAMKXfg0NDcDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAABQALAAAAAAQABAAAAVXICWOZFkCE2CWaeMwwLCKQPNMBCQEa/0UAEXiIFhNHKmkYcA7MQgKwMGw2PUgiYkBsWuWBoJpNTWjBATgAECCKgfelHVkUh5NIpJ5XXTP7/kRcH9mgyUhADshACH+T0NvcHlyaWdodCAyMDAwIGJ5IFN1biBNaWNyb3N5c3RlbXMsIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC4NCkpMRiBHUiBWZXIgMS4wDQoAOw==';

    var zoomout_icon = 'data:image/gif;base64,R0lGODlhEAAQAMT/AAAAAP///zAwYT09bn19lYSEnJGRqZ6et5iYsJ6etqWlvbi40MzM5cXF3czM5Li4w+Hh5tTU2fDw84uMom49DbWKcQ0NDcDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAEAABcALAAAAAAQABAAAAVX4CWOZFlagGWWaQQ9lrCKViQVxjQEay0RjYXDMFgBIKmkQsA7PQyLhEHB2PUmDoTisGuWBINpNTW7BAbggKWCKgfelzUFUB4BKJV5XXTP7/kUcH9mgyUhADshACH+T0NvcHlyaWdodCAyMDAwIGJ5IFN1biBNaWNyb3N5c3RlbXMsIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC4NCkpMRiBHUiBWZXIgMS4wDQoAOw==';

    var zoomsel_icon = 'data:image/gif;base64,R0lGODlhEAAQAIQBAAAAAP///zAwYT09bpGRqZ6et5iYsKWlvbi40MzM5cXF3czM5OHh5tTU2fDw84uMom49DbWKcfLy8g0NDf///////////////////////////////////////////////yH+EUNyZWF0ZWQgd2l0aCBHSU1QACH5BAEAAB8ALAAAAAAQABAAAAVY4CeOZFlOwCQF5pg2TDMJbIsCODBIdgMgCgSAsDMBGICgAnCgmSY+IAGQKJYkt5y1FBAMCIdqqvUJSAZebARFXvE+kwgEQCYBIHJ6XXSX710QK38jNYMkIQA7';

    // module exports
    return {
        graph: graph,
        tick_interval: tick_interval
        //engineering_notation: engineering_notation
    };
};
