jade
====

The Jade schematic entry and simulation tool is a work in progress,
but you're welcome to experiment!  Here's how:

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

Using Jade
=====

Jade can be used either standalone or as embedded courseware in
the edX framework.  To use Jade in standalone mode, simply change
to the top-level directory of this repo and run

    python -m SimpleHTTPServer

to start a basic HTTP server listening on port localhost:8000.
You can access Jade at

    http://localhost:8000/jade_standalone.html

As you enter schematics they are saved using the HTML5 localStorage
persistent store supplied by your browser, which is specific to the
particular URL (different URLs => different localStoage).  Each time
you modify your design, it will be saved in localStorage, which
persists across browser sessions.  Next time you browse to the URL
above, you'll be able to pick up your design where you left off.
Note: in many browsers localStorage does not function correctly with
file:// URLs, which is why we needed to start a local HTTP server in
order to access Jade.

Jade can be configured to display only certain simulation tools and
parts.  The default configuration in jade_standalone.html shows all
available tools and parts libraries.
