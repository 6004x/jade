jade
====

Copyright (c) 2015 M.I.T. Department of Electrical Engineering and
Computer Science

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Notes
=====

The Jade schematic entry and simulation tool is a work in progress,
but you're welcome experiment!  Here's how:

1.  Fork this repository: click on the "Fork" button in the upper
    right.  This will make a copy of the repository under your own
    github account.  Now clone your copy of the repo onto your
    local machine.

2.  Any changes, commits, pushes, pulls, etc. will be to your copy
    of the repo.  If you want to be able keep up with changes to the
    original Jade repo, it's convenient to add another remote that
    refers to the original repo:

        git remote add upstream https://github.com/6004x/jade.git

3.  To keep up-to-date with the original repo:

        git fetch upstream
        git checkout master    # if you were on a branch...
        git merge upstream/master
        git push               # save updates in local repo

The repo includes a simple file server used by the development
version of Jade to read and write design libraries.  To access
Jade via the browser and to give it access to the simple file
server, you need to set up web access to the local repo.

Look at README.WINDOWS for advice on running jade on
a Windows machine.

I use apache2 as a web server on my machine and added the following
to my apache configuration file:

    Alias /jade /Users/cjt/git/jade
    <Directory "/Users/cjt/git/jade">
      Options FollowSymLinks Includes ExecCGI MultiViews
      AllowOverride All
      #ScriptInterpreterSource Registry   # on Windows
      AddHandler cgi-script .py
      Order allow,deny
      Allow from all
      #Require all granted  # for Apache 2.4
    </Directory>

where "/Users/cjt/git/jade" is the pathname to my local copy
of the Jade repo.  Make sure your apache configuration is
loading mod_cgi and mod_alias.  I can then access Jade at

    http://localhost/jade/src/jade_local.html

and the somewhat terse Jade help file at

    http://localhost/jade/help.html

User module files are stored in the src/files/ subdirectory
of the repo.  To specify a particular module file, you can
provide an optional "modules" argument to the URL above:

    http://localhost/jade/src/jade_local.html?modules=cjt

would access the modules file "files/cjt".

NOTE: You may have to change permissions on the /src/files/
subdirectory to give apache read/write access to the user
libraries:

    chmod 777 files files/*


