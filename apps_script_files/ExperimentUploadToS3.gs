// --- CONFIGURATION ---
// Script properties are now retrieved inside functions
// to ensure they work properly with triggers
// ---------------------

/**
 * The main function triggered when a new form response is submitted.
 * @param {Object} e The event object passed by the form submission trigger.
 */
function onExperimentCreateFormSubmit(e) {
  // Get script properties inside the function
  const scriptProperties = PropertiesService.getScriptProperties();
  const S3_BUCKET_NAME = scriptProperties.getProperty('EXPERIMENT_DATA_S3_BUCKET_NAME');

  // 1. Get the data and headers
  Logger.log(e);
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRowData = e.values;

  // 2. Get and validate the config file
  const fileUploadQuestion = "Please Upload the JSON file for your experiment";

  // Find the column index for the User ID question
  const fileUploadIndex = headers.indexOf(fileUploadQuestion);

  if (fileUploadIndex == -1) {
    throw new Error("Unable to find file upload column in response");
  }

  const fileUploadURL = newRowData[fileUploadIndex];
  const experiment_config_blob = getBlobFromDriveUrl(fileUploadURL);

  Logger.log(experiment_config_blob);

  // Validate uploaded file looks right
  parseYamlBlob(experiment_config_blob);

  // 3. Prepare S3 Paths
  const experimentNameQuestion = "What would you like to name your experiment?";
  const experimentNameIndex = headers.indexOf(experimentNameQuestion);
  const experimentName = newRowData[experimentNameIndex];

  // The final S3 object key includes the user ID folder/prefix
  const experimentNameSanitised = sanitise_experiment_name(experimentName);
  const configS3Key = `${experimentNameSanitised}/config.yaml`;

  // 4. Upload the Config file to S3
  uploadToS3(configS3Key, experiment_config_blob, scriptProperties);
  Logger.log(`Successfully uploaded file: ${configS3Key} to S3 bucket ${S3_BUCKET_NAME}.`);

  deleteFileFromDriveUrl(fileUploadURL);
  Logger.log(`Deleted config file from Drive: ${fileUploadURL}`);

  // 5. Get and Upload the Consent Form (New Logic)
  const consentFormQuestion = "Please upload the consent form for your experiment";
  const consentFormIndex = headers.indexOf(consentFormQuestion);

  if (consentFormIndex !== -1) {
    const consentFormURL = newRowData[consentFormIndex];
    
    // Check if the user actually uploaded a file (field is not empty)
    if (consentFormURL) {
      const consentBlob = getBlobFromDriveUrl(consentFormURL);
      
      // Define key: Same folder as config, specific filename
      const consentS3Key = `${experimentNameSanitised}/consent_form.pdf`;
      
      uploadToS3(consentS3Key, consentBlob, scriptProperties);
      Logger.log(`Successfully uploaded consent form: ${consentS3Key}`);

      deleteFileFromDriveUrl(consentFormURL);
      Logger.log(`Deleted consent form from Drive: ${consentFormURL}`);
    } else {
      Logger.log("No consent form URL found in the response.");
    }
  } else {
    // You might want to throw an error here if the column is strictly required
    Logger.log("Warning: Consent form column not found in headers.");
  }

  // 6. Generate participant URLs
  // Note: Ensure your Google Form settings have "Collect email addresses" turned ON.
  const emailIndex = headers.indexOf("Email address");

  if (emailIndex == -1) {
    throw new Error("Could not find 'Email address' column. Please check Form settings.");
  }
  const researcherEmail = newRowData[emailIndex];
  const numberOfParticipantsQuestion = "How many participant links would you like to generate?"
  const numberOfParticipants = newRowData[headers.indexOf(numberOfParticipantsQuestion)]
  generate_and_send_urls_to_researcher(numberOfParticipants, researcherEmail, experimentNameSanitised);
}

/**
 * Sanitizes the experiment name for file system/S3 safety.
 */
function sanitise_experiment_name(name) {
  return String(name).replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase();
}

/**
 * Extracts the file ID from a Drive URL and returns the file as a Blob.
 * @param {string} driveUrl The URL from the Form response (e.g., "https://drive.google.com/open?id=...")
 * @return {GoogleAppsScript.Base.Blob} The file blob ready for upload.
 */
function getBlobFromDriveUrl(driveUrl) {
  // 1. Extract the ID using a Regex (handles "open?id=" and "/d/" formats)
  // Drive IDs are alphanumeric strings usually ~33 characters long
  const idMatch = driveUrl.match(/[-\w]{25,}/);
  
  if (!idMatch) {
    throw new Error("Could not extract File ID from URL: " + driveUrl);
  }
  
  const fileId = idMatch[0];
  
  // 2. Fetch the file using the DriveApp service
  const driveFile = DriveApp.getFileById(fileId);
  
  // 3. Get the blob (content)
  return driveFile.getBlob();
}

/**
 * Extracts the file ID from a URL and moves the file to the Trash.
 * @param {string} driveUrl The Google Drive URL.
 */
function deleteFileFromDriveUrl(driveUrl) {
  try {
    const idMatch = driveUrl.match(/[-\w]{25,}/);
    if (idMatch) {
      const fileId = idMatch[0];
      DriveApp.getFileById(fileId).setTrashed(true);
    } else {
      Logger.log("Could not extract ID for deletion from: " + driveUrl);
    }
  } catch (e) {
    // We catch errors here so that if deletion fails, the script doesn't crash
    // (since the important part—uploading to S3—is already done).
    Logger.log("Error deleting file: " + e.message);
  }
}