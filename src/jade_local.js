// see if jade's URL includes an arg of the form 'dir=xxx'
// if so look file libraries in subdirectory xxx
jade.page_args = function () {
    var page_args = window.location.search.match(/\w+=[\w|\%|\:]+/g);
    result = {}
    if (page_args) {
        $.each(page_args,function (index,arg) {
            var key_value = arg.split('=');
            // if no value supplied, just use key as the value
            result[key_value[0]] = key_value[1] || key_value[0];
        });
    }
    return result;
}

jade.user = function () {
    var user = jade.page_args()['user'] || 'guest';
    return user;
}

jade.load_from_server = function (filename,callback) {
    var args = {
        async: false, // hang until load completes
        url: 'server_local.py',
        type: 'POST',
        data: { file: filename },
        dataType: 'json',
        error: function(jqXHR, textStatus, errorThrown) {
            alert('Error while loading file '+filename+': '+errorThrown);
        },
        success: function(result) {
            // result[1] is username
            if (callback) callback(result[0]);
        }
    };
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

jade.setup = (function () {
    // set up editor inside of div's with class "jade"
    function setup() {
        var args = jade.page_args();

        // look for nodes of class "jade" and give them an editor
        $('.jade').each(function(index, div) {
            // skip if this div has already been configured
            if (div.jade === undefined) {
                // now create the editor
                var j = new jade.Jade(div);
                // start with configuration from body of div
                var config = JSON.parse(div.text());
                // override with any values set it url
                $.extend(config,args)
                // pass to editor
                j.initialize(config);
            }
        });
    }

    //////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////

    return {
        setup: setup,   // called to initialize jade editors on this page
    };

}());

// set up editor inside of div's with class "jade"
$(document).ready(jade.setup.setup);

// notify user of unsaved changes
$(window).bind('beforeunload',function () {
    if ($('body').attr('data-dirty') !== undefined)
        return 'You have unsaved changes on this page.';
    return undefined;
});
