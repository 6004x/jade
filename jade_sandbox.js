// sandbox can only load shared modules
jade.load_from_server = function (filename,shared,callback) {
    if (!shared) {
        alert('Sandbox can only load shared modules.');
    } else {
        var args = {
            async: false, // hang until load completes
            url: 'https://6004.mit.edu/coursewarex/' + filename,
            type: 'POST',
            dataType: 'json',
            error: function(jqXHR, textStatus, errorThrown) {
                alert('Error while loading file '+filename+': '+errorThrown);
            },
            success: function(result) {
                if (callback) callback(result);
            }
        };
        $.ajax(args);
    }
};

// sandbox doesn't save changes
jade.save_to_server = function (json,callback) {
};

jade.request_zip_url = undefined;  //'/jade-server?zip=1';

jade.setup = function () {
    // look for nodes of class "jade" and give them an editor
    $('.jade').each(function(index, div) {
        // skip if this div has already been configured
        if (div.jade === undefined) {
            var config = {};

            // use text from jade.div, if any
            var text = $(div).text().trim();
            $(div).empty();  // all done with innards
            if (text) config = JSON.parse(text);

            // now create the editor and pass along initial configuration
            var j = new jade.Jade(div);
            j.initialize(config);
        }
    });
};

// set up editor inside of div's with class "jade"
$(document).ready(jade.setup);
