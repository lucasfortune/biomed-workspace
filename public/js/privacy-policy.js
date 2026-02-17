/**
 * Privacy Policy Modal — Bilingual (EN/DE)
 * Shared between welcome.html and register.html
 */

const privacyPolicyContent = {
  en: `
    <h2>Privacy Policy</h2>
    <p><em>Last updated: February 2026</em></p>

    <h3>1. Data Controller</h3>
    <p>
      <strong>Julius Maximilian University Würzburg</strong><br>
      Sanderring 2, 97070 Würzburg, Germany<br>
      Email: <a href="mailto:lucas.fortune@uni-wuerzburg.de">lucas.fortune@uni-wuerzburg.de</a>
    </p>

    <h3>2. What Data We Collect</h3>
    <p>When you register for an account, we collect the following personal data:</p>
    <ul>
      <li><strong>Username</strong> — for authentication and identification</li>
      <li><strong>Email address</strong> — for account-related communication</li>
      <li><strong>Full name</strong> — for identification and administrative purposes</li>
      <li><strong>Institution</strong> — to verify affiliation with a research organization</li>
      <li><strong>Password</strong> — stored exclusively as a cryptographic hash (bcrypt); the plaintext password is never stored</li>
    </ul>

    <h3>3. Session &amp; Processing Data</h3>
    <p>During your use of the platform, the following temporary data may be processed:</p>
    <ul>
      <li><strong>Uploaded image files</strong> (TIFF stacks) — used for training, inference, and denoising</li>
      <li><strong>Trained machine learning models</strong> — generated from your data</li>
      <li><strong>Inference and processing results</strong> — segmentation masks, denoised images, meshes</li>
      <li><strong>Annotation data</strong> — created during the annotation workflow</li>
    </ul>
    <p>
      <strong>This session data is automatically deleted upon logout or after 1 hour of inactivity.</strong>
      It is not retained on the server long-term.
    </p>

    <h3>4. Purpose of Data Processing</h3>
    <p>Your personal data is processed for the following purposes:</p>
    <ul>
      <li>Account creation and authentication</li>
      <li>Access control (admin approval workflow)</li>
      <li>Providing the biomedical image processing services</li>
      <li>Platform administration and user management</li>
    </ul>

    <h3>5. Legal Basis</h3>
    <p>
      We process your data based on the following legal grounds under the GDPR:
    </p>
    <ul>
      <li><strong>Art. 6(1)(a) GDPR — Consent:</strong> By checking the consent box during registration, you consent to the processing of your personal data as described in this policy.</li>
      <li><strong>Art. 6(1)(b) GDPR — Contract performance:</strong> Processing is necessary to provide the platform services you registered for.</li>
    </ul>

    <h3>6. Data Retention</h3>
    <ul>
      <li><strong>Session data</strong> (uploads, models, results): Automatically deleted on logout or after 1 hour of inactivity.</li>
      <li><strong>Account data</strong> (username, email, name, institution): Retained as long as your account is active. Accounts inactive for more than 12 months may be deleted after prior notification.</li>
    </ul>
    <p>You may request deletion of your account and all associated data at any time (see Section 8).</p>

    <h3>7. Data Sharing &amp; Third Parties</h3>
    <p>
      <strong>We do not share your data with third parties.</strong>
      The platform is fully self-hosted. No external analytics, tracking services, or cloud storage providers are used.
      Your data remains exclusively on our server.
    </p>

    <h3>8. Your Rights</h3>
    <p>Under the GDPR, you have the following rights regarding your personal data:</p>
    <ul>
      <li><strong>Right of access</strong> (Art. 15) — Request information about your stored data</li>
      <li><strong>Right to rectification</strong> (Art. 16) — Request correction of inaccurate data</li>
      <li><strong>Right to erasure</strong> (Art. 17) — Request deletion of your data</li>
      <li><strong>Right to restriction</strong> (Art. 18) — Request restriction of processing</li>
      <li><strong>Right to data portability</strong> (Art. 20) — Receive your data in a machine-readable format</li>
      <li><strong>Right to object</strong> (Art. 21) — Object to data processing</li>
      <li><strong>Right to withdraw consent</strong> (Art. 7(3)) — Withdraw your consent at any time without affecting the lawfulness of prior processing</li>
    </ul>
    <p>To exercise any of these rights, please contact us at <a href="mailto:[EMAIL]">[EMAIL]</a>.</p>

    <h3>9. Supervisory Authority</h3>
    <p>
      You have the right to lodge a complaint with a data protection supervisory authority.
      The competent authority in Germany is:
    </p>
    <p>
      Der Bundesbeauftragte f&uuml;r den Datenschutz und die Informationsfreiheit (BfDI)<br>
      Graurheindorfer Str. 153, 53117 Bonn<br>
      <a href="https://www.bfdi.bund.de" target="_blank" rel="noopener noreferrer">www.bfdi.bund.de</a>
    </p>

    <h3>10. Cookies &amp; Technical Data</h3>
    <p>
      This platform uses a <strong>single session cookie</strong> that is strictly necessary for authentication.
      It does not track your behaviour, is not used for analytics, and is deleted when your session expires.
      No consent banner is required for this cookie under GDPR (Art. 5(3) ePrivacy Directive — strictly necessary cookies).
    </p>

    <h3>11. Security Measures</h3>
    <ul>
      <li>Passwords are hashed using bcrypt (industry-standard cryptographic hashing)</li>
      <li>Session-based authentication with server-side session management</li>
      <li>All user data is isolated per session</li>
      <li>No plaintext credentials are stored at any point</li>
    </ul>

    <h3>12. Changes to This Policy</h3>
    <p>
      We may update this privacy policy from time to time. Significant changes will be communicated
      through the platform. The date at the top of this policy indicates when it was last updated.
    </p>
  `,

  de: `
    <h2>Datenschutzerkl&auml;rung</h2>
    <p><em>Letzte Aktualisierung: Februar 2026</em></p>

    <h3>1. Verantwortlicher</h3>
    <p>
      <strong>[ORGANIZATION]</strong><br>
      [ADDRESS]<br>
      E-Mail: <a href="mailto:[EMAIL]">[EMAIL]</a>
    </p>
    <p>
      Datenschutzbeauftragter:<br>
      [DPO_NAME]<br>
      E-Mail: <a href="mailto:[DPO_EMAIL]">[DPO_EMAIL]</a>
    </p>

    <h3>2. Welche Daten wir erheben</h3>
    <p>Bei der Registrierung erheben wir folgende personenbezogene Daten:</p>
    <ul>
      <li><strong>Benutzername</strong> — zur Authentifizierung und Identifikation</li>
      <li><strong>E-Mail-Adresse</strong> — f&uuml;r kontobezogene Kommunikation</li>
      <li><strong>Vollst&auml;ndiger Name</strong> — zur Identifikation und Verwaltung</li>
      <li><strong>Institution</strong> — zur Verifizierung der Zugeh&ouml;rigkeit zu einer Forschungseinrichtung</li>
      <li><strong>Passwort</strong> — wird ausschlie&szlig;lich als kryptographischer Hash (bcrypt) gespeichert; das Klartextpasswort wird zu keinem Zeitpunkt gespeichert</li>
    </ul>

    <h3>3. Sitzungs- &amp; Verarbeitungsdaten</h3>
    <p>W&auml;hrend der Nutzung der Plattform k&ouml;nnen folgende tempor&auml;re Daten verarbeitet werden:</p>
    <ul>
      <li><strong>Hochgeladene Bilddateien</strong> (TIFF-Stapel) — f&uuml;r Training, Inferenz und Entrauschung</li>
      <li><strong>Trainierte Machine-Learning-Modelle</strong> — aus Ihren Daten generiert</li>
      <li><strong>Inferenz- und Verarbeitungsergebnisse</strong> — Segmentierungsmasken, entrauschte Bilder, Meshes</li>
      <li><strong>Annotationsdaten</strong> — w&auml;hrend des Annotationsworkflows erstellt</li>
    </ul>
    <p>
      <strong>Diese Sitzungsdaten werden beim Abmelden oder nach 1 Stunde Inaktivit&auml;t automatisch gel&ouml;scht.</strong>
      Sie werden nicht langfristig auf dem Server gespeichert.
    </p>

    <h3>4. Zweck der Datenverarbeitung</h3>
    <p>Ihre personenbezogenen Daten werden f&uuml;r folgende Zwecke verarbeitet:</p>
    <ul>
      <li>Kontoerstellung und Authentifizierung</li>
      <li>Zugriffskontrolle (Administrator-Genehmigungsworkflow)</li>
      <li>Bereitstellung der biomedizinischen Bildverarbeitungsdienste</li>
      <li>Plattformverwaltung und Benutzerverwaltung</li>
    </ul>

    <h3>5. Rechtsgrundlage</h3>
    <p>
      Wir verarbeiten Ihre Daten auf folgenden Rechtsgrundlagen der DSGVO:
    </p>
    <ul>
      <li><strong>Art. 6 Abs. 1 lit. a DSGVO — Einwilligung:</strong> Durch Ankreuzen des Einwilligungsk&auml;stchens bei der Registrierung stimmen Sie der Verarbeitung Ihrer personenbezogenen Daten gem&auml;&szlig; dieser Erkl&auml;rung zu.</li>
      <li><strong>Art. 6 Abs. 1 lit. b DSGVO — Vertragserf&uuml;llung:</strong> Die Verarbeitung ist zur Bereitstellung der Plattformdienste erforderlich, f&uuml;r die Sie sich registriert haben.</li>
    </ul>

    <h3>6. Datenspeicherung</h3>
    <ul>
      <li><strong>Sitzungsdaten</strong> (Uploads, Modelle, Ergebnisse): Werden beim Abmelden oder nach 1 Stunde Inaktivit&auml;t automatisch gel&ouml;scht.</li>
      <li><strong>Kontodaten</strong> (Benutzername, E-Mail, Name, Institution): Werden gespeichert, solange Ihr Konto aktiv ist. Konten, die l&auml;nger als 12 Monate inaktiv sind, k&ouml;nnen nach vorheriger Benachrichtigung gel&ouml;scht werden.</li>
    </ul>
    <p>Sie k&ouml;nnen jederzeit die L&ouml;schung Ihres Kontos und aller damit verbundenen Daten beantragen (siehe Abschnitt 8).</p>

    <h3>7. Datenweitergabe &amp; Dritte</h3>
    <p>
      <strong>Wir geben Ihre Daten nicht an Dritte weiter.</strong>
      Die Plattform wird vollst&auml;ndig selbst gehostet. Es werden keine externen Analyse-, Tracking-Dienste oder Cloud-Speicheranbieter verwendet.
      Ihre Daten verbleiben ausschlie&szlig;lich auf unserem Server.
    </p>

    <h3>8. Ihre Rechte</h3>
    <p>Gem&auml;&szlig; der DSGVO haben Sie folgende Rechte in Bezug auf Ihre personenbezogenen Daten:</p>
    <ul>
      <li><strong>Auskunftsrecht</strong> (Art. 15) — Auskunft &uuml;ber Ihre gespeicherten Daten</li>
      <li><strong>Recht auf Berichtigung</strong> (Art. 16) — Korrektur unrichtiger Daten</li>
      <li><strong>Recht auf L&ouml;schung</strong> (Art. 17) — L&ouml;schung Ihrer Daten</li>
      <li><strong>Recht auf Einschr&auml;nkung</strong> (Art. 18) — Einschr&auml;nkung der Verarbeitung</li>
      <li><strong>Recht auf Daten&uuml;bertragbarkeit</strong> (Art. 20) — Erhalt Ihrer Daten in einem maschinenlesbaren Format</li>
      <li><strong>Widerspruchsrecht</strong> (Art. 21) — Widerspruch gegen die Datenverarbeitung</li>
      <li><strong>Recht auf Widerruf der Einwilligung</strong> (Art. 7 Abs. 3) — Widerruf Ihrer Einwilligung jederzeit, ohne dass die Rechtm&auml;&szlig;igkeit der bisherigen Verarbeitung ber&uuml;hrt wird</li>
    </ul>
    <p>Um eines dieser Rechte auszu&uuml;ben, kontaktieren Sie uns bitte unter <a href="mailto:[EMAIL]">[EMAIL]</a>.</p>

    <h3>9. Aufsichtsbeh&ouml;rde</h3>
    <p>
      Sie haben das Recht, eine Beschwerde bei einer Datenschutzaufsichtsbeh&ouml;rde einzureichen.
      Die zust&auml;ndige Beh&ouml;rde in Deutschland ist:
    </p>
    <p>
      Der Bundesbeauftragte f&uuml;r den Datenschutz und die Informationsfreiheit (BfDI)<br>
      Graurheindorfer Str. 153, 53117 Bonn<br>
      <a href="https://www.bfdi.bund.de" target="_blank" rel="noopener noreferrer">www.bfdi.bund.de</a>
    </p>

    <h3>10. Cookies &amp; technische Daten</h3>
    <p>
      Diese Plattform verwendet ein <strong>einzelnes Sitzungscookie</strong>, das f&uuml;r die Authentifizierung zwingend erforderlich ist.
      Es verfolgt nicht Ihr Verhalten, wird nicht f&uuml;r Analysen verwendet und wird gel&ouml;scht, wenn Ihre Sitzung abl&auml;uft.
      F&uuml;r dieses Cookie ist gem&auml;&szlig; DSGVO (Art. 5 Abs. 3 ePrivacy-Richtlinie — technisch notwendige Cookies) kein Einwilligungsbanner erforderlich.
    </p>

    <h3>11. Sicherheitsma&szlig;nahmen</h3>
    <ul>
      <li>Passw&ouml;rter werden mit bcrypt gehasht (branchenstandard-kryptographisches Hashing)</li>
      <li>Sitzungsbasierte Authentifizierung mit serverseitiger Sitzungsverwaltung</li>
      <li>Alle Benutzerdaten sind pro Sitzung isoliert</li>
      <li>Es werden zu keinem Zeitpunkt Klartext-Anmeldedaten gespeichert</li>
    </ul>

    <h3>12. &Auml;nderungen dieser Erkl&auml;rung</h3>
    <p>
      Wir k&ouml;nnen diese Datenschutzerkl&auml;rung von Zeit zu Zeit aktualisieren. Wesentliche &Auml;nderungen werden
      &uuml;ber die Plattform mitgeteilt. Das Datum oben in dieser Erkl&auml;rung gibt an, wann sie zuletzt aktualisiert wurde.
    </p>
  `
};

/**
 * Open the privacy policy modal. Creates the modal DOM on first call.
 */
function openPrivacyPolicy(event) {
  if (event) event.preventDefault();

  let modal = document.getElementById('privacyPolicyModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'privacyPolicyModal';
    modal.className = 'pp-modal-overlay';
    modal.innerHTML = `
      <div class="pp-modal" role="dialog" aria-modal="true" aria-label="Privacy Policy">
        <div class="pp-modal-header">
          <div class="pp-lang-tabs">
            <button class="pp-lang-tab active" data-lang="en">English</button>
            <button class="pp-lang-tab" data-lang="de">Deutsch</button>
          </div>
          <button class="pp-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="pp-modal-body">
          <div class="pp-content" data-lang="en">${privacyPolicyContent.en}</div>
          <div class="pp-content" data-lang="de" style="display:none;">${privacyPolicyContent.de}</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.pp-modal-close').addEventListener('click', closePrivacyPolicy);

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePrivacyPolicy();
    });

    // Language tabs
    modal.querySelectorAll('.pp-lang-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const lang = tab.dataset.lang;
        modal.querySelectorAll('.pp-lang-tab').forEach(t => t.classList.toggle('active', t.dataset.lang === lang));
        modal.querySelectorAll('.pp-content').forEach(c => c.style.display = c.dataset.lang === lang ? '' : 'none');
      });
    });
  }

  modal.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // Escape key handler
  modal._escHandler = (e) => {
    if (e.key === 'Escape') closePrivacyPolicy();
  };
  document.addEventListener('keydown', modal._escHandler);
}

/**
 * Close the privacy policy modal.
 */
function closePrivacyPolicy() {
  const modal = document.getElementById('privacyPolicyModal');
  if (modal) {
    modal.classList.remove('visible');
    document.body.style.overflow = '';
    if (modal._escHandler) {
      document.removeEventListener('keydown', modal._escHandler);
      modal._escHandler = null;
    }
  }
}
