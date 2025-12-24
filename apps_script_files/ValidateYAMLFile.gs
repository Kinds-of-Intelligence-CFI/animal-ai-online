/**
 * TODO: This should check the file looks right and return a boolean as to whether we should 
 * A utility function to parse a simple YAML string into a JavaScript object.
 * NOTE: This is a minimalist parser and only handles basic key-value pairs and 
 * simple lists. For production use with complex YAML, consider a full library.
 * * @param {string} yamlString The raw string content of the YAML file.
 * @return {Object} The parsed JavaScript object.
 * @throws {Error} if parsing fails or YAML format is invalid.
 */
function parseYamlString(yamlString) {
  // Simple helper to determine value type (string, number, boolean)
  function parseValue(value) {
    value = value.trim();
    if (value === 'true' || value === 'True') return true;
    if (value === 'false' || value === 'False') return false;
    if (!isNaN(value) && value.length > 0) return Number(value);
    
    // Remove quotes for simple strings
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }
    return value;
  }
  
  // Strip comments, trim, and filter empty lines
  const lines = yamlString.split('\n')
    .map(line => line.replace(/#.*$/, '').trim())
    .filter(line => line.length > 0);

  const result = {};
  let currentKey = null;

  try {
    lines.forEach(line => {
      // Check for lists (simplified for top-level lists under a key)
      const listMatch = line.match(/^\-\s*(.*)/);
      if (listMatch) {
        if (currentKey && Array.isArray(result[currentKey])) {
          result[currentKey].push(parseValue(listMatch[1].trim()));
        }
        return;
      }
      
      // Check for key-value pairs
      const kvMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();

        if (value === '') {
          // Header for a nested object or list (we initialize as an empty object)
          currentKey = key;
          // Assume a list if the next line starts with a dash, otherwise an object
          result[key] = []; 
        } else {
          // Simple key-value pair
          result[key] = parseValue(value);
          currentKey = key; // Keep track of the current key
        }
      }
    });
  } catch (e) {
    throw new Error("YAML Parsing failed. Check format for indentation or special characters.");
  }
  
  return result;
}

/**
 * Parses the content of a Google Drive file Blob as YAML and logs the structure.
 * * @param {GoogleAppsScript.Base.Blob} blob The file blob (config file).
 * @return {Object} The parsed experiment configuration object.
 * @throws {Error} if the blob content cannot be parsed as valid YAML.
 */
function parseYamlBlob(blob) {
  // 1. Convert the Blob content to a string
  const yamlContent = blob.getDataAsString();

  // 2. Parse the YAML content using the internal function
  const configObject = parseYamlString(yamlContent);

  // 3. Log the parsed object structure in a clean, indented way
  Logger.log("--- Successfully Parsed YAML Configuration ---");
  Logger.log(`File Name: ${blob.getName()}`);
  Logger.log(JSON.stringify(configObject, null, 2));
  Logger.log("----------------------------------------------");
  
  return configObject;
}