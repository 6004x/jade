// interface to local cgibin server

jade_defs.services = function(jade) {
    // see if jade's URL includes an arg of the form 'arg=value'
    jade.page_args = function () {
        var page_args = window.location.search.match(/([^?=&]+)(=([^&]*))?/g);
        var result = {};
        if (page_args) {
            $.each(page_args,function (index,arg) {
                var key_value = arg.split('=');
                // if no value supplied, just use key as the value
                result[key_value[0]] = key_value[1] || key_value[0];
            });
        }
        return result;
    };

    jade.user = function () {
        var user = jade.page_args()['modules'] || 'guest';
        return user.split(',')[0];
    };

    jade.load_from_server = function (filename,shared,callback) {
        var args = {
            async: false, // hang until load completes
            url: shared ? 'files/'+filename : 'server_local.py',
            type: 'POST',
            dataType: 'json',
            error: function(jqXHR, textStatus, errorThrown) {
                alert('Error while loading file '+filename+': '+errorThrown);
            },
            success: function(result) {
                if (callback) callback(result);
            }
        };
        if (!shared) args.data = {file: filename };
        $.ajax(args);
    };

    jade.save_to_server = function (json,callback) {
        var args = {
            url: 'server_local.py',
            type: 'POST',
            data: {
                file: jade.user(),
                json: JSON.stringify(json)
            },
            error: function(jqXHR, textStatus, errorThrown) {
                alert(errorThrown);
            },
            success: function() {
                if (callback) callback();
            }
        };
        $.ajax(args);
    };

    jade.request_zip_url = undefined;  //'/jade-server?zip=1';

    jade.unsaved_changes = function(which) {
        if (which && $('body').attr('data-dirty') === undefined)
            $('body').attr('data-dirty','true');
        else if (!which && $('body').attr('data-dirty') !== undefined)
            $('body').removeAttr('data-dirty');
    };

    // set up editor inside of div's with class "jade"
    jade.setup = function (div) {
        // skip if this div has already been configured
        if (div.jade === undefined) {
            var config = {};

            // use text from jade.div, if any
            var text = $(div).html();
            // strip off <!--[CDATA[ ... ]]--> tag if it's there
            if (text.lastIndexOf('<!--[CDATA[',0) === 0) {
                text = text.substring(11,text.length-5);
            }

            $(div).empty();  // all done with innards
            if (text)
                try {
                    config = JSON.parse(text);
                } catch(e) {
                    console.log('Error parsing configuration: '+e);
                }

            // override with any values set in url
            $.extend(config,jade.page_args());

            // now create the editor and pass along initial configuration
            var j = new jade.Jade(div);
            j.initialize(config);
        }
    };
};

// set up editor inside of div's with class "jade"
$(document).ready(function () {
    $('.jade').each(function(index, div) {
        var j = new jade_defs.jade();
        jade_defs.services(j);
        j.setup(div);
    });
});

// notify user of unsaved changes
$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});
