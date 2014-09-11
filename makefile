# Makefile for Jade subtree

USERDIR=$(USER)@MIT.EDU

what:
	@echo "Make what?  Plausible args include"
	@echo
	@echo "  make files:           scp 6004x:jade/libraries/$(USERDIR)/* to local directory"
	@echo "  make try:             run local copy of Jade"
	@echo

################################################################################
### Running from local git sandbox
### Prereqs:
###   - Apache, configured so that
###      - http://localhost/jade accesses this directory
###      - CGI scripts executable from localhost/jade/src
###         (Options ExecCGI, AddHandler cgi-script .cgi)
###   - Jade files to be accessed in src/files
################################################################################

# Copy user's Jade files from 6004x to src/files, where they are accessed by server_local.cgi:
files:
	- mkdir src/files
	scp -r 6004X.csail.mit.edu:jade/libraries/$(USERDIR)/* src/files/
	chmod 777 src/files src/files/*

try:
	chrome http://localhost/jade/src/jade_local.html

