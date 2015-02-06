
from testvecutils import *

title = """
// Test vectors for 2-bit carry lookahead adder
"""

w=2

# print header for a line:
def head():
    print "//", hd(" AA", w), hd("BB", w), "C", hd("SS", w)

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(a, b, cin):
    s = a+b+cin
    cout = (a+b+cin) >> w
    print "  ", bin(a, w), bin(b, w), bin(cin, 1), lh(s, w)

def doit():
    print title
    head()

    mask = (1<<w)-1

    # Exhaustive tests:
    for cin in range(2):

        for a in range(1<<w):
            for b in range(1<<w):
                trycase(a, b, cin)

doit()

