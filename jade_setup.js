
jade.setup = (function () {

    // set up editor inside of div's with class "jade"
    function setup() {
        // if we're inside an iframe, try to reach into parent frame to get
        // configuration attributes
        var configuration = {};   // default null configuration
        if (window.parent != window) {
            // look through all the iframes in the parent until we find ourselves
            var us;
            try {
                // the cross-domain watch dogs may not approve!
                $('iframe',window.parent.document).each(function (index,iframe) {
                    if (iframe.contentWindow == window) us = $(iframe);
                });
            } catch(err) { }

            if (us) {
                // found the iframe that owns our window, so now find configuration
                // div, if any, and grab its contents as a JSON object
                while (us.length > 0) {
                    us = us.parent();
                    var div = $('.jade-attrs',us);
                    if (div.length > 0) {
                        configuration = JSON.parse(div.text());
                        break;
                    }
                    if (us.is('span')) break;  // stop when we which <span> parent
                }
            }
        }

        // look for nodes of class "jade" and give them an editor
        $('.jade').each(function(index, div) {
            // skip if this div has already been configured
            if (div.jade === undefined) {
                // apply configuration to div
                $.each(configuration,function (attr,value) {
                    $(div).attr(attr,value);
                });

                // now create the editor
                new jade.Jade(div);
            }
        });
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////

    return {
        setup: setup
    };

}());

// set up editor inside of div's with class "jade"
$(document).ready(jade.setup.setup);


