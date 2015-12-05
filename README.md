Using Jade
=====

The Jade schematic entry and simulation tool is a work in progress,
but you're welcome to experiment!

Jade can be used either standalone or as embedded courseware in the
edX framework.  To use Jade locally in standalone mode, grab the jade.zip
file, unzip it on your machine, change to the directory with the jade
files and run

    python server.py

to start a basic HTTP server listening on port localhost:8000.
You can access Jade at

    http://localhost:8000/jade.html

In the standalone version of Jade, changes are saved to the local
server as they're made.  The saved state is for the particular .html
file you accessed, so if you have several .html files for, say,
different projects, their state will be stored separately.  Next time
you browse to the URL above, you'll be able to pick up your design
where you left off.

Jade can be configured to display only certain simulation tools and
parts.  The default configuration in jade_standalone.html shows all
available tools and parts libraries.  You can also load parts libraries
specific to an assignment, with schematics, icons and (read-only) tests
that serve as template and test jig for a design problem.

jade
====

To use this repo and keep up-to-date with changes:

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

