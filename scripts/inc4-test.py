
from testvecutils import *

title = """
// Test vectors for 4-bit incrementor slice

"""

w = 4

def trycase(n, cin):
    cout = (cin + n) >> w
    print "  ", bin(n, w), bin(cin, 1), lh(n+cin, w), lh(cout, 1)


def doit():
    print title
    print "\n// Try Cin=0:"
    for x in [0, (1<<w)-1, 0xA, 0x5]: trycase(x, 0)

    print "\n// With Cin=1, it should increment:"
    for i in range(16): trycase(i, 1)


doit()

