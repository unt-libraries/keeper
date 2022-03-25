import 'dropzone';

// Initialize and configure Dropzone
Dropzone.autoDiscover = false;

// Assign Dropzone preview template and delete from DOM so it isn't submitted
const previewTemplateNode = document.querySelector('#previewTemplate');
const previewTemplate = previewTemplateNode.innerHTML;
if (previewTemplateNode.parentNode !== null) {
  previewTemplateNode.parentNode.removeChild(previewTemplateNode);
}

// Initialize Parsley and attach to form
const parsleyForm = $('#dropzoneUpload').parsley();

// Override Parsley options
$.extend(parsleyForm.options, {
    errorsContainer(parsleyField) {
        return parsleyField.$element
            .siblings('.form-control-feedback').attr('title');
    },
    errorsWrapper: false,
});

function scrollToElementTop(element) {
    const headerHeight = document.querySelector('header').offsetHeight;
    window.scroll({
        top: element.offsetTop,
        behavior: 'smooth',
    })
}

function enableFormButtons() {
    document.querySelector('#submitButton')
      .removeAttribute('disabled');
    document.querySelector('#removeAllButton')
      .removeAttribute('disabled');
}

function disableFormButtons() {
    document.querySelector('#submitButton')
      .setAttribute('disabled', 'disabled');
    document.querySelector('#removeAllButton')
      .setAttribute('disabled', 'disabled');
}

function showProgressBars() {
    document.querySelectorAll('.file-progress')
      .forEach((el) => el.classList.remove('file-progress--hidden'));
    document.querySelector('#totalProgressBar')
      .classList.remove('dropzone-form__upload-progress--hidden');
}

function hideProgressBars() {
    document.querySelectorAll('.file-progress')
      .forEach((el) => el.classList.add('file-progress--hidden'));
    document.querySelector('#totalProgressBar')
      .classList.add('dropzone-form__upload-progress--hidden');
}

// Called by myDropzone after successful response from server
function formSuccess(files, response) {
    const formContainer = document.querySelector('#formContainer');

    formContainer.innerHTML = response.template;
    scrollToElementTop(formContainer);
}

function disableFormFields() {
    document.querySelectorAll('fieldset')
      .forEach((el) => el.setAttribute('disabled', 'disabled'));
    document.querySelectorAll('textarea[name=file-file_description]')
      .forEach((el) => el.setAttribute('disabled', 'disabled'));
    document.querySelectorAll('.dropzone-template__remove-button')
      .forEach((el) => el.classList.add('hidden'));
    document.querySelectorAll('.dropzone-form')
      .forEach((el) => el.classList.add('hidden'));
}

function enableFormFields() {
    document.querySelectorAll('fieldset')
      .forEach((el) => el.removeAttribute('disabled'));
    document.querySelectorAll('textarea[name=file-file_description]')
      .forEach((el) => el.removeAttr('disabled'));
    document.querySelectorAll('.dropzone-template__remove-button')
      .forEach((el) => el.classList.remove('hidden'));
    document.querySelectorAll('.dropzone-form')
      .forEach((el) => el.classList.remove('hidden'));
}

// Called by myDropzone after Dropzone successmultiple, but error from server
function formErrors(response) {
    hideProgressBars();
    const errorsForm = response.errorsForm;
    const errorsFile = response.errorsFile;

    console.log(errorsForm);
    console.log(errorsFile);

    const formErrorEl = document.querySelector('#dropzoneFormError')

    const newDiv = document.createElement('div');
    newDiv.className = 'alert alert-danger alert-dismissible';
    newDiv.setAttribute('role', 'alert');

    const newButton = document.createElement('button');
    newButton.setAttribute('type', 'button');
    newButton.className = 'close';
    newButton.dataset.dismiss = 'alert';
    newButton.ariaLabel = 'Close';
    newDiv.appendChild(newButton);

    const newSpan = document.createElement('span');
    newSpan.ariaHidden = 'true';
    newSpan.textContent = '&times;';
    newButton.appendChild(newSpan);

    // Display server side form errors
    for (let error in errorsForm) {
        const newStrong = document.createElement('strong');
        newStrong.className = 'error';
        newStrong.textContent = `Error in field ${error}: ${errorsForm[error]}`
        newDiv.appendChild(newStrong);

        formErrorEl.appendChild(newDiv);
    }

    // Display server side file errors
    for (let error of errorsFile) {
        const newStrong = document.createElement('strong');
        newStrong.className = 'error';
        newStrong.textContent = `Error in file ${error.file_name}: ${error.error.file}`
        newDiv.appendChild(newStrong);

        formErrorEl.appendChild(newDiv);
    }

    enableFormFields();
    scrollToElementTop(document.querySelector('#dropzoneFormError'));
}

// add tooltips and error classes on parsley field errors. Accepts parsleyFieldInstance
function displayParsleyError(fieldInstance) {
    const $element = fieldInstance.$element;
    const messages = fieldInstance.getErrorsMessages();
    if ($element.attr('id').toLowerCase().indexOf('g-recaptcha-response') >= 0) {
        document.querySelector('#grecaptcha-required').style.display = '';
    } else {
        $element.siblings('[data-toggle="tooltip"]')
        .removeClass('far fa-check')
        .addClass('far fa-times')
        .tooltip('dispose')
        .tooltip({
            animation: false,
            container: 'body',
            placement: 'top',
            title: messages.join('<br>'),
            trigger: 'manual',
        })
        .tooltip('show')
      .closest('.form-group')
        .removeClass('has-success')
        .addClass('has-error');
    }
}

// destroy tooltips and add success classes on parsley field success
function removeParsleyError(fieldInstance) {
    const $element = fieldInstance.$element;
    if ($element.attr('id').toLowerCase().indexOf('g-recaptcha-response') >= 0) {
        document.querySelector('#grecaptcha-required').style.display = 'none';
    } else {
        $element.siblings('[data-toggle="tooltip"]')
        .removeClass('far fa-times')
        .addClass('far fa-check')
        .tooltip('dispose')
      .closest('.form-group')
        .removeClass('has-error')
        .addClass('has-success');
    }
}

// bind Parsley field errors to displayParsleyError()
window.Parsley.on('field:error', (fieldInstance) => {
    displayParsleyError(fieldInstance);
});

// bind Parsley field success to removeParsleyError()
window.Parsley.on('field:success', (fieldInstance) => {
    removeParsleyError(fieldInstance);
});

// Add form validation data not provided by Django
const phoneNumberField = document.querySelector('#id_accession-phone_number');
phoneNumberField.setAttribute('type', 'tel');
phoneNumberField.dataset.parsleyGroup = 'phone';
phoneNumberField.dataset.parsleyMinlength = '10';

// Bind Dropzone to form element and configure
const myDropzone = new Dropzone('#dropzoneUpload', {
    paramName() {
        return 'file-file';
    },
    autoProcessQueue: false,
    parallelUploads: 100, // parallelUploads must equal maxFiles or separate requests are needed
    createImageThumbnails: true,
    // thumbnailHeight: 200,
    thumbnailWidth: 200,
    maxFiles: 100,
    maxFilesize: 4000,
    uploadMultiple: true,
    clickable: '#dropzoneClickable',
    previewsContainer: '#dropzonePreviews',
    previewTemplate,
    acceptedFiles: window.acceptedFileTypes,
    accept(file, done) {
        // Display error on add if file is smaller than 1024 bytes
        if (file.size < 1024) {
            file.previewElement.getElementsByClassName('error')[0].style.display = 'block';
            done("The file's size is too small. It will not be uploaded.");
        } else {
            done();
        }
    },
    init() {
        const submitButton = document.querySelector('#submitButton');
        const removeAllButton = document.querySelector('#removeAllButton');
        const myDropzone = this;

        submitButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Only process queue if the form passes Parsley validation
            if (parsleyForm.validate()) {
                myDropzone.processQueue();
            }
        });

        removeAllButton.addEventListener('click', () => {
            myDropzone.removeAllFiles(true);
            scrollToElementTop(document.querySelector('#formContainer'));
        });

        // Behavior for drag/hover file over dropzone form
        this.on('dragover', () => {
            document.querySelector('#formContainer')
              .classList.add('dropzone-form__drag-hover');
        });
        this.on('dragleave', () => {
            document.querySelector('#formContainer')
              .classList.remove('dropzone-form__drag-hover');
        });
        this.on('dragend', () => {
            document.querySelector('#formContainer')
              .classList.remove('dropzone-form__drag-hover');
        });
        this.on('drop', () => {
            document.querySelector('#formContainer')
              .classList.remove('dropzone-form__drag-hover');
        });

        // Fires when a file is added to the upload list
        this.on('addedfile', (file) => {
            // DOM manipulation for added file
            enableFormButtons();

            // Look up the file mime type for non-images to find an icon to display,
            // replacing the img element
            if (file.type.slice(0, 5) !== 'image') {
                const imgElement = file.previewElement.getElementsByTagName('img')[0];
                const imgParent = imgElement.parentNode;
                const mimeType = file.type.split('/')[0];
                const newNode = document.createElement('i');

                if (Object.keys(acceptedFiles).indexOf(file.type) > -1) {
                    newNode.className = `far fa-${acceptedFiles[file.type]} fa-5x`;
                } else if (Object.keys(acceptedFiles).indexOf(`${mimeType}/*`) > -1) {
                    newNode.className = `far fa-${acceptedFiles[`${mimeType}/*`]} fa-5x`;
                } else {
                    newNode.className = 'far fa-file fa-5x';
                }
                imgParent.replaceChild(newNode, imgElement);
            }
        });

        // Updates the total upload progress bar
        this.on('totaluploadprogress', (progress) => {
            const progressBar = document.querySelector('#total-progress');
            progressBar.style.width = `${progress}%`;
            if (progress === 100) {
                progressBar.textContent = 'Processing';
            } else {
                progressBar.textContent =`${parseInt(progress, 10)}%`;
            }
        });

        // Fires when all files are removed from upload list
        this.on('reset', () => {
            disableFormButtons();
            hideProgressBars();
        });

        // Fires when form is submitted and files are being uploaded
        this.on('sendingmultiple', () => {
            disableFormFields();
            showProgressBars();
            scrollToElementTop(document.querySelector('#formContainer'));
        });

        // Fires after successful file upload / form submission
        this.on('successmultiple', (files, response) => {
            if (response.success) {
                formSuccess(files, response);
            } else {
                formErrors(response);
            }
        });

        // Fires on Dropzone upload errors
        this.on('errormultiple', (files) => {
            files.forEach((file) => {
                file.previewElement.getElementsByClassName('error')[0].style.display = 'block';
            });
        });
    },
});
