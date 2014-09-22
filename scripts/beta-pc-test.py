
from testvecutils import *

title = """
// Test vectors for Beta PC subsystem

"""


# Some globals:
PC = '-'                                  # Current value of PC[31:0]


# print header for a line:
def head():

    # Inputs:
    print "//", " ", " PC", " "*30, " "*29
    print "//", "R", "SEL", hd(" JT[31:2] ", 30), hd(" BT[30:2] ", 29),

    # Outputs:
    print hd(" NPC[31:0] ", 32), hd(" PC[31:0] ", 32), hd(" PCINC[31:2] ", 30)


# Generate a test case.
# Args can be integer values, or '-' for undefined.
# Updates global PC to npc value.
def trycase(reset, pcsel, jt, bt, npc):
    global PC
    
    if PC != '-': pcinc = (PC >> 2) + 1
    else: pcinc = '-'

    print "  ", bin(reset, 1), bin(pcsel, 3), bin(jt, 30), bin(bt, 29),
    print lh(npc, 32), lh(PC, 32), lh(pcinc, 30)

    PC = npc

def doit():
    global PC
    
    print title
    head()

    cmt("initial RESET to set PC=0:")
    trycase(1, '-',                     # reset, pcsel
            '-', '-',                   # jt, bt
            0x80000000)                # npc


    # PC should be 0x80000000 now.  Do a few increments:

    cmt("Try a few increments:")
    pc = 0x80000000
    for i in range(10):
        trycase(0, 0, '-', '-', PC+4)

    cmt("Try some branches:")
    wadr = 0x5555                       # BT[30:2] (no K bit)
    trycase(0, 1, '-', wadr, (wadr<<2) | 0x80000000)
    wadr = 0xAAAA
    trycase(0, 1, '-', wadr, (wadr<<2) | 0x80000000)

    cmt("Try a JUMP to user mode:")
    wadr = 0x5555
    trycase(0, 2, wadr, '-', wadr<<2)

    cmt("Then try JUMP back to to kernel mode; should stay in user mode.")
    wadr = 0x2000AAAA
    trycase(0, 2, wadr, '-', (wadr<<2) & 0x7FFFFFFF)

    cmt("Now a user-mode branch:")
    wadr = 0xBADBABE                   # BT[30:2] (no K bit)
    trycase(0, 1, '-', wadr, (wadr<<2) & 0x7FFFFFFF)

    cmt("ILLOP (PCSEL=3) should take us to 0x80000004:")
    trycase(0, 3, '-', '-', 0x80000004)

    cmt("XINT (PCSEL=4) should take us to 0x80000008:")
    trycase(0, 4, '-', '-', 0x80000008)

doit()

