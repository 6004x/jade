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
}

jade.setup = (function () {
    // set up editor inside of div's with class "jade"
    function setup() {
        var args = jade.page_args();

        // look for nodes of class "jade" and give them an editor
        $('.jade').each(function(index, div) {
            // skip if this div has already been configured
            if (div.jade === undefined) {
                var config = {};

                // use text from jade.div, if any
                var text = $(div).text().trim();
                $(div).empty();  // all done with innards
                if (text) config = JSON.parse(text);

                // override with any values set in url
                $.extend(config,args);

                // now create the editor and pass along initial configuration
                var j = new jade.Jade(div);
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
        setup: setup   // called to initialize jade editors on this page
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
