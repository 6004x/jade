// Copyright (C) 2011-2015 Massachusetts Institute of Technology
// Chris Terman

jade_defs.property_view = function(jade) {

    //////////////////////////////////////////////////////////////////////
    //
    // Property editor
    //
    //////////////////////////////////////////////////////////////////////

    function PropertyEditor(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;
        this.tab = div.tab;

        this.table = $('<table class="jade-property-table"></div>');
        $(div).append(this.table);
        this.build_table();
    }

    PropertyEditor.prototype.resize = function(dx, dy, selected) {};

    PropertyEditor.prototype.show = function() {};

    PropertyEditor.prototype.set_aspect = function(module) {
        this.module = module;

        $(this.tab).html(PropertyEditor.prototype.editor_name);
        if (module.read_only()) $(this.tab).append(' ' + jade.icons.readonly);

        this.build_table();
    };

    PropertyEditor.prototype.build_table = function() {
        var editor = this; // for closures
        var module = editor.module;
        var table;

        var read_only = this.module && this.module.read_only();

        // remove old rows from table
        table = this.table;   // for closure below
        table.empty();

        if (module === undefined) {
            table.append('<tr><td>To edit properites you must first specify a module.</td></tr>');
            return;
        }

        // header row
        table.append('<tr><th>Action</th><th>Name</th><th>Label</th><th>Type</th><th>Value</th><th>Edit</th><th>Choices</th></tr>');

        // one row for each existing property
        $.each(module.properties,function (pname,property) {
            var tr = $('<tr></tr>');
            table.append(tr);

            // action
            var td = $('<td></td>');
            tr.append(td);
            var field = jade.build_button('delete', function(event) {
                // remove property, rebuild table
                module.remove_property(pname);
                editor.build_table();
            });
            if (read_only) $(field).attr('disabled','true');
            td.append(field);

            // name (not editable)
            td = $('<td></td>').text(pname);
            tr.append(td);

            function add_column(attr,field,filter) {
                var td = $('<td></td>').append(field);
                tr.append(td);
                if (read_only) $(field).attr('disabled','true');
                $(field).on('change',function (event) {
                    var v = event.target.value.trim();
                    if (filter) v = filter(v);
                    module.set_property_attribute(pname,attr,v);
                });
            }

            add_column('label',jade.build_input('text', 10, property.label || property.name));
            add_column('type',jade.build_select(['string', 'name', 'number', 'nlist', 'menu'], property.type || 'string'));
            add_column('value',jade.build_input('text', 10, property.value || ''));
            add_column('edit',jade.build_select(['yes', 'no'], property.edit || 'yes'));
            add_column('choices',jade.build_input('text', 15, property.choices ? property.choices.join() : ''),
                       function (v) {
                           var vlist = v.split(',').map(function (c) { return c.trim(); });
                           return vlist;
                       });
        });

        if (!read_only) {
            var fields = {};
            fields.action = jade.build_button('add', function(event) {
                // validate then add new property
                var name = fields.name.value.trim();
                if (name === '') alert('Please enter a name for the new property');
                else if (name in editor.module.properties) alert('Oops, duplicate property name!');
                else {
                    var p = {};
                    p.label = fields.label.value.trim() || name;
                    p.type = fields.type.value;
                    p.value = fields.value.value.trim();
                    p.edit = fields.edit.value;
                    var vlist = fields.choices.value.split(',');
                    for (var i = 0; i < vlist.length; i += 1) {
                        vlist[i] = vlist[i].trim();
                    }
                    p.choices = vlist;
                    editor.module.set_property(name, p);

                    editor.build_table();
                }
            });
            fields.name = jade.build_input('text', 10, '');
            fields.label = jade.build_input('text', 10, '');
            fields.type = jade.build_select(['string', 'name', 'number', 'nlist', 'menu'], 'string');
            fields.value = jade.build_input('text', 10, '');
            fields.edit = jade.build_select(['yes', 'no'], 'yes');
            fields.choices = jade.build_input('text', 15, '');


            // last row for adding properties
            var tr = $('<tr></tr>');
            for (var f in fields) tr.append($('<td></td>').append(fields[f]));
            table.append(tr);
        }
    };

    PropertyEditor.prototype.editor_name = 'properties';
    jade.editors.push(PropertyEditor);

    ///////////////////////////////////////////////////////////////////////////////
    //
    // Module exports
    //
    //////////////////////////////////////////////////////////////////////////////

    return {
    };
};

