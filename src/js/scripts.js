// Initialize and configure Dropzone
Dropzone.autoDiscover = false;

// Assign Dropzone preview template and delete from DOM so it isn't submitted
const previewTemplateNode = $('#previewTemplate');
const previewTemplate = previewTemplateNode.html();
previewTemplateNode.remove();

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

function scrollToElementTop($element) {
    $('html, body').animate({
        scrollTop: $element.offset().top,
    }, {
        duration: 1000,
    });
}

function enableFormButtons() {
    $('#submitButton').removeAttr('disabled');
    $('#removeAllButton').removeAttr('disabled');
}

function disableFormButtons() {
    $('#submitButton').attr('disabled', 'disabled');
    $('#removeAllButton').attr('disabled', 'disabled');
}

function showProgressBars() {
    $('.file-progress').removeClass('file-progress--hidden');
    $('#totalProgressBar').removeClass('dropzone-form__upload-progress--hidden');
}

function hideProgressBars() {
    $('.file-progress').addClass('file-progress--hidden');
    $('#totalProgressBar').addClass('dropzone-form__upload-progress--hidden');
}

// Called by myDropzone after successful response from server
function formSuccess(files, response) {
    const $formContainer = $('#formContainer');

    $formContainer.html(response.template);
    scrollToElementTop($formContainer);
}

function disableFormFields() {
    $('fieldset').attr('disabled', 'disabled');
    $('textarea[name=file-file_description]').attr('disabled', 'disabled');
    $('.dropzone-template__remove-button').addClass('hidden');
    $('.dropzone-form').addClass('hidden');
}

function enableFormFields() {
    $('fieldset').removeAttr('disabled');
    $('textarea[name=file-file_description]').removeAttr('disabled');
    $('.dropzone-template__remove-button').removeClass('hidden');
    $('.dropzone-form').removeClass('hidden');
}

// Called by myDropzone after Dropzone successmultiple, but error from server
function formErrors(response) {
    hideProgressBars();
    const errorsForm = response.errorsForm;
    const errorsFile = response.errorsFile;

    console.log(errorsForm);
    console.log(errorsFile);

    // Display server side form errors
    for (let error in errorsForm) {
        $('#dropzoneFormError').append('<div class="alert alert-danger alert-dismissible" role="alert">' +
            '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span></button>' +
            '<strong class="error">' +
            'Error in field ' + error + ': ' + errorsForm[error] +
            '</strong>' +
            '</div>');
    }

    // Display server side file errors
    for (let error of errorsFile) {
        $('#dropzoneFormError').append('<div class="alert alert-danger alert-dismissible" role="alert">' +
            '<button type="button" class="close" data-dismiss="alert" aria-label="Close">' +
            '<span aria-hidden="true">&times;</span></button>' +
            '<strong class="error">' +
            'Error in file ' + error.file_name + ': ' + error.error.file +
            '</strong>' +
            '</div>');
    }

    enableFormFields();
    scrollToElementTop($('#dropzoneFormError'));
}

// add tooltips and error classes on parsley field errors. Accepts parsleyFieldInstance
function displayParsleyError(fieldInstance) {
    const messages = fieldInstance.getErrorsMessages();

    if (fieldInstance.$element.context.id === 'g-recaptcha-response') {
        document.querySelector('#grecaptcha-required').style.display = '';
    } else {
        fieldInstance.$element.siblings('[data-toggle="tooltip"]')
        .removeClass('fa fa-check')
        .addClass('fa fa-times')
        .tooltip('destroy')
        .tooltip({
            animation: false,
            container: 'body',
            placement: 'top',
            title: messages,
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
    if (fieldInstance.$element.context.id === 'g-recaptcha-response') {
        document.querySelector('#grecaptcha-required').style.display = 'none';
    } else {
        fieldInstance.$element.siblings('[data-toggle="tooltip"]')
        .removeClass('fa fa-times')
        .addClass('fa fa-check')
        .tooltip('destroy')
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
$('#id_accession-phone_number')
  .attr('type', 'tel')
  .attr('data-parsley-group', 'phone')
  .attr('data-parsley-minlength', '10');

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
        const $submitButton = $('#submitButton');
        const $removeAllButton = $('#removeAllButton');
        const myDropzone = this;

        $submitButton.on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Only process queue if the form passes Parsley validation
            if (parsleyForm.validate()) {
                myDropzone.processQueue();
            }
        });

        $removeAllButton.on('click', () => {
            myDropzone.removeAllFiles(true);
            scrollToElementTop($('#formContainer'));
        });

        // Behavior for drag/hover file over dropzone form
        this.on('dragover', () => {
            $('#formContainer').addClass('dropzone-form__drag-hover');
        });
        this.on('dragleave', () => {
            $('#formContainer').removeClass('dropzone-form__drag-hover');
        });
        this.on('dragend', () => {
            $('#formContainer').removeClass('dropzone-form__drag-hover');
        });
        this.on('drop', () => {
            $('#formContainer').removeClass('dropzone-form__drag-hover');
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

                if ($.inArray(file.type, Object.keys(acceptedFiles)) > -1) {
                    newNode.className = `fa fa-${acceptedFiles[file.type]} fa-5x`;
                } else if ($.inArray(`${mimeType}/*`, Object.keys(acceptedFiles)) > -1) {
                    newNode.className = `fa fa-${acceptedFiles[`${mimeType}/*`]} fa-5x`;
                } else {
                    newNode.className = 'fa fa-file-o fa-5x';
                }
                imgParent.replaceChild(newNode, imgElement);
            }
        });

        // Updates the total upload progress bar
        this.on('totaluploadprogress', (progress) => {
            const $progressBar = $('#total-progress');
            $progressBar.width(`${progress}%`);
            if (progress === 100) {
                $progressBar.text('Processing');
            } else {
                $progressBar.text(`${parseInt(progress, 10)}%`);
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
            scrollToElementTop($('#formContainer'));
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
