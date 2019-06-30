<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Schematic Entry</title>

<script type="text/javascript" src="fet_vsparms.js"></script>
<script type="text/javascript" src="fet_vsp.js"></script>
<script type="text/javascript" src="schematicvsp.js"></script>
<script type="text/javascript" src="cktsimvsp.js"></script>

<script type="text/javascript">
// characters allowed in a file name
valid_characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';  


function check_file_name(evt) {
  var theFormSch = document.forms["schematic"];
  var n = theFormSch["file"].value;
  var saveflg = theFormSch["save"].value;
  

  if (n == '') {
    alert('Please enter a file name.');
    return false;
  }

  var r = window.prompt("Please Supply a UserID \(Your Initials\) and Click OK or Click Cancel to terminate File Transfer", "");
  if (r == null) {
    return false;
  }

  var rmatch = n.substr(n.length - r.length - 1);
  if (rmatch.match(r) == null) {
    var nfull = n.concat(r);
    theFormSch["file"].value = nfull;
  }

  for (var i = 0; i < n.length; i++) {
    var cindexof = valid_characters.indexOf(n.charAt(i));
    if (cindexof == -1) {
      alert('Invalid character in file name: ' + n.charAt(i) + '  --characters must be letters, numbers or _ (underscore).');
      return false;
    }
  }
  // all set to submit
  prepare_schematics();
  return true;
}
</script>
</head>
<body>




<script>
// Check for the various File API support.
if (window.File && window.FileReader && window.FileList && window.Blob) {
  // Great success! All the File APIs are supported.
} else {
  alert('Uploading model parameters requires a File API that is not fully supported in this browser. Either avoid uploading model parameters or check http://caniuse.com/fileapi for a browser with full File API support.');
}
</script>

<table width="1000">
<form name="schematic" method="POST" action="schvsp.cgi" onsubmit="return check_file_name()">
<tr>
<td colspan="1">
<b>Schematic Name:</b> <input type="text" name="file" value="" size="20">
<input type="submit" name="load" value="Load">
<input type="submit" name="save" value="Save">
</td>
<td colspan="2">
<b>VS FET Parameter File: </b> 
<input type="button" value="File Reload" id="fetReload">
<input type="file" id="fetParms" name="fetFile"> 
</td>
</tr>
</table>
<p>
<input type="hidden" class="schematic" width="850" height="500" name="sch" value=""/>
</form>

<script type="text/javascript">
document.getElementById('fetParms').addEventListener('change',rdFetF,false);
document.getElementById('fetReload').addEventListener('click',rdFetF,false);
</script>

</p>
<A href="schematicvsp.js">schematicvsp.js</A>, <A href="cktsimvsp.js">cktsimvsp.js</A>,<A href="fet_vsp.js">fet_vsp.js</A>,<A href="fet_vsparms.js">fet_vsparms.js</A>


</body>
</html>

