// Copyright (C) 2011-2014 Massachusetts Institute of Technology
// Chris Terman

// keep jslint happy
//var console,JSON;
//var $,jade,cktsim,plot;

jade.property_view = (function() {

    //////////////////////////////////////////////////////////////////////
    //
    // Property editor
    //
    //////////////////////////////////////////////////////////////////////

    function PropertyEditor(div, parent) {
        this.jade = parent;
        this.status = parent.status;
        this.module = undefined;

        this.table = document.createElement('table');
        this.table.className = 'jade-property-table';
        div.appendChild(this.table);
        this.build_table();
    }

    PropertyEditor.prototype.resize = function(dx, dy, selected) {};

    PropertyEditor.prototype.show = function() {};

    PropertyEditor.prototype.set_aspect = function(module) {
        this.module = module;
        this.build_table();
    };

    PropertyEditor.prototype.build_table = function() {
        var editor = this; // for closures
        var tr, td, field;

        // remove old rows from table
        $(this.table).empty();

        if (editor.module === undefined) {
            this.table.innerHTML = '<tr><td>To edit properites you must first specify a module.</td></tr>';
            return;
        }

        // header row
        tr = document.createElement('tr');
        this.table.appendChild(tr);
        tr.innerHTML = '<th>Action</th><th>Name</th><th>Label</th><th>Type</th><th>Value</th><th>Edit</th><th>Choices</th>';

        // one row for each existing property
        for (var p in editor.module.properties) {
            var props = editor.module.properties[p];
            tr = document.createElement('tr');
            this.table.appendChild(tr);

            // action
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_button('delete', function(event) {
                // remove property, rebuild table
                editor.module.remove_property(event.target.pname);
                editor.build_table();
            });
            field.pname = p; // so callback knows what to delete
            td.appendChild(field);

            // name (not editable)
            td = document.createElement('td');
            tr.appendChild(td);
            td.appendChild(document.createTextNode(p));

            // label
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_input('text', 10, props.label || props.name);
            field.pname = p;
            field.props = props;
            $(field).change(function(event) {
                var v = event.target.value.trim();
                if (v === '') {
                    v = event.target.pname; // default label is property name
                    event.target.value = v;
                }
                event.target.props.label = v;
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // type
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_select(['string', 'menu'], props.type || 'string');
            field.props = props;
            $(field).change(function(event) {
                event.target.props.type = event.target.value;
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // value
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_input('text', 10, props.value || '');
            field.props = props;
            $(field).change(function(event) {
                event.target.props.value = event.target.value.trim();
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // edit
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_select(['yes', 'no'], props.edit || 'yes');
            field.props = props;
            $(field).change(function(event) {
                event.target.props.edit = event.target.value;
                editor.module.set_modified(true);
            });
            td.appendChild(field);

            // choices
            td = document.createElement('td');
            tr.appendChild(td);
            field = jade.build_input('text', 15, props.choices ? props.choices.join() : '');
            field.props = props;
            $(field).change(function(event) {
                var vlist = event.target.value.split(',');
                for (var i = 0; i < vlist.length; i += 1) {
                    vlist[i] = vlist[i].trim();
                }
                event.target.props.choices = vlist;
                event.target.value = vlist.join();
                editor.module.set_modified(true);
            });
            td.appendChild(field);
        }

        // last row for adding properties
        tr = document.createElement('tr');
        this.table.appendChild(tr);

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
        fields.type = jade.build_select(['string', 'menu'], 'string');
        fields.value = jade.build_input('text', 10, '');
        fields.edit = jade.build_select(['yes', 'no'], 'yes');
        fields.choices = jade.build_input('text', 15, '');

        for (var f in fields) {
            td = document.createElement('td');
            tr.appendChild(td);
            td.appendChild(fields[f]);
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
}());
