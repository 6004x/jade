jade
====

The Jade schematic entry and simulation tool is a work in progress,
but you're welcome experiment!  Here's how:

1.  Fork this repository: click on the "Fork" button in the upper
    right.  This will make a copy of the repository under your own
    github account.

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

I use apache2 as a web server on my machine and added the following
to my apache configuration file:

    Alias /jade /Users/cjt/git/jade
    <Directory "/Users/cjt/git/jade">
      Order allow,deny
      Allow from all
      Options FollowSymLinks Includes ExecCGI MultiViews
      AllowOverride All
      AddHandler cgi-script .py
    </Directory>

where "/Users/cjt/git/jade" is the pathname to my local copy
of the Jade repo.  I can then access Jade at

    http://localhost/jade/src/jade_local.html

and the somewhat terse Jade help file at

    http://localhost/jade/help.html

The user libraries are stored in the src/files/ subdirectory
of the repo.  If several people are sharing access, you can
provide an optional "dir" argument to the URL above, specifying
another level of subdirectory for each user:

    http://localhost/jade/src/jade_local.html?dir=cjt

would access library files in src/files/cjt/.

NOTE: You may have to change permissions on the /src/files/
subdirectory to give apache read/write access to the user
libraries:

    chmod 777 src/files src/files/* src/files/*/*


