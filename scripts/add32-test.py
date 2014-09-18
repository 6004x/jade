
from testvecutils import *

title = """
// Test vectors for 32-bit combinational adder

"""

w=32

# print header for a line:
def head():
    print "//", hd(" A[31:0] ", w), hd(" B[31:0] ", w), "C", hd(" S[31:0] ", w), "C"

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(a, b, cin):
    s = a+b+cin
    cout = (a+b+cin) >> w
    print "  ", bin(a, w), bin(b, w), bin(cin, 1), lh(s, w), lh(cout, 1)

def doit():
    print title
    head()
    mone = (1<<w)-1

    trycase(0, 0, 0)
    trycase(0, 0, 1)
    trycase(1, 0, 1)
    trycase(mone, 1, 0)
    trycase(0, mone, 1)
    trycase(1, mone, 0)
    trycase(1, mone, 1)

    for i in range(w+1):
        trycase (1<<i, 1<<i, 0)
        trycase ((1<<i) - 1, 1, 0)

doit()

