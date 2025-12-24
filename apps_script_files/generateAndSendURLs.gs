/**
 * Generates specific participant URLs using a cryptographic hash as the ID, 
 * creates a .txt file containing the links, emails it to the researcher,
 * and uploads a CSV of IDs to S3 with columns: id, completed.
 * * @param {number} numberOfParticipants - The number of links to generate.
 * @param {string} recipientEmail - The email address of the researcher.
 * @param {string} experimentName - The name of the experiment for the URL.
 */
function generate_and_send_urls_to_researcher(numberOfParticipants, recipientEmail, experimentName) {
  Logger.log(`Generating ${numberOfParticipants} secure links for experiment: ${experimentName}`);

  // TODO: Move URL to an env variable
  const baseUrl = "https://benaslater.github.io/animal-ai-online-experiment/";
  let urlList = [];
  let participantIds = []; 
  const batchTimestamp = new Date().getTime(); 

  // --- 1. Generate URLs with Secure Hash ---
  for (let i = 1; i <= numberOfParticipants; i++) {
    const inputString = `${i}|${experimentName}|${batchTimestamp}`;
    
    // Compute the SHA-256 hash
    const bytes = Utilities.newBlob(inputString).getBytes();
    const hashBytes = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        bytes
    );
    
    // Convert to hex string and truncate
    const fullHash = hashBytes.map(byte => (byte & 0xff).toString(16).padStart(2, '0')).join('');
    const participantHash = fullHash.substring(0, 16); 
    
    // Construct the URL
    const safeExperimentName = encodeURIComponent(experimentName);
    const url = `${baseUrl}?${safeExperimentName}&${participantHash}`;
    
    urlList.push(url);
    participantIds.push(participantHash); 
  }

  // --- 2. Create the .txt file attachment (URLs for Email) ---
  const fileContent = urlList.join("\n");
  
  // Sanitize experiment name for the filename
  const safeFilename = String(experimentName).replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase();
  
  // Create a Blob object for the attachment
  const attachmentFilename = `${safeFilename}_participant_urls.txt`;
  const txtAttachment = Utilities.newBlob(fileContent, 'text/plain', attachmentFilename);

  // --- 3. Prepare CSV Content for S3 ---
  let csvContent = "id,completed\n";
  
  // Data rows: ID,False,False
  csvContent += participantIds.map(id => `${id},False`).join("\n");

  // --- 4. Send the Email with Attachment ---
  const subject = `Participant Links (Attachment): ${experimentName}`;
  const body = `Hello,

The ${numberOfParticipants} participant URLs for your experiment "${experimentName}" have been generated.

You will find the complete list attached to this email as a plain text file (${attachmentFilename}).

Best,
Experiment Bot`;

  MailApp.sendEmail({
    to: recipientEmail,
    subject: subject,
    body: body,
    attachments: [txtAttachment]
  });
  
  Logger.log(`Email sent to ${recipientEmail} with ${urlList.length} links attached.`);

  // Pass the CSV content to the S3 uploader
  uploadParticipantIdsToS3(experimentName, csvContent);
}

/**
 * Run this function from the editor dropdown to test the email logic
 * without submitting a real Google Form.
 */
function test_generate_and_send_urls_to_researcher() {
  const mockParticipants = 5; 
  const mockEmail = "bas58@cam.ac.uk";
  const mockExperimentName = "bentest3"

  Logger.log("--- Starting Test ---");
  generate_and_send_urls_to_researcher(mockParticipants, mockEmail, mockExperimentName);
  Logger.log("--- Test Complete ---");
}

/**
 * Encapsulated function to prepare and upload participant IDs CSV to S3.
 * @param {string} experimentName 
 * @param {string} csvContent - The CSV string content
 */
function uploadParticipantIdsToS3(experimentName, csvContent) {
  const experimentNameSanitised = sanitise_experiment_name(experimentName);
  
  const s3Key = `${experimentNameSanitised}/participant_ids.csv`; 
  
  // Create the blob specifically for S3 with text/csv MIME type
  const blob = Utilities.newBlob(csvContent, 'text/csv', 'participant_ids.csv');
  
  const scriptProperties = PropertiesService.getScriptProperties();
  
  try {
    uploadToS3(s3Key, blob, scriptProperties);
    Logger.log(`Successfully uploaded CSV to S3: ${s3Key}`);
  } catch (e) {
    Logger.log(`FAILED to upload to S3: ${e.message}`);
    throw e; 
  }
}

function sanitise_experiment_name(name) {
   return String(name).replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase();
}