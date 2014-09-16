# Makefile for Jade subtree

# Here's the directory containing MY files:
MYFILES=src/files/$(USER)

what:
	@echo "Make what?  Plausible args include"
	@echo
	@echo "  make run:             run local copy of Jade, using MYFILES"
	@echo
	@echo "  make commit           update modified/deleted files prior to git push"


commit:
	git commit -a -m "`date`"

################################################################################
### Running from local git sandbox
### Prereqs:
###   - Apache, configured so that
###      - http://localhost/jade accesses this directory
###      - CGI scripts executable from localhost/jade/src
###         (Options ExecCGI, AddHandler cgi-script .cgi)
###   - Jade files to be accessed in src/files
################################################################################

run:
	chrome "http://localhost/jade/src/jade_local.html?dir=$(USER)"

# Alternative run commands, pointing at different module directories:

run-cjt:
	chrome "http://localhost/jade/src/jade_local.html?dir=cjt"

run-ward:
	chrome "http://localhost/jade/src/jade_local.html?dir=cjt"

run-notes:
	chrome "http://localhost/jade/src/jade_local.html?dir=notes"

run-bugs:
	chrome "http://localhost/jade/src/jade_local.html?dir=bugs"

# Add/delete my files to/from the GIT repo:
push-mine:	$(MYFILES)
		git add --all $(MYFILES)

push-notes:	src/files/notes
		git add --all src/files/notes

push-bugs:	src/files/bugs
		git add --all src/files/bugs

# Copy user's Jade files from 6004x to src/files, where they are accessed by server_local.cgi:
files:
	- mkdir src/files
	scp -r 6004X.csail.mit.edu:jade/libraries/$(USERDIR)/* src/files/
	chmod 777 src/files src/files/*

try:
	chrome http://localhost/jade/src/jade_local.html

