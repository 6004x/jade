from testvecutils import *

title = """
// Test vectors for 29-bit incrementor for Beta PC

"""

w=29

# print header for a line:
def head():
    print "//", hd(" P[31:0] ", w), hd(" N[31:0] ", w)

def trycase(n):
    print "  ", bin(n, w), lh(n+1, w)

def doit():
    print title
    head()

    trycase(0)
    for i in range(w+1):
        trycase (1<<i)
        trycase ((1<<i) - 1)

doit()

