$(document).ready(function(){

  let $faqTypeahead = $("#faq-typeahead"),
    $studentHelper = $("#student-helper"),
    $courseTypeAhead = $("input.course-typeahead"),
    $azTypeahead = $("input.az-typeahead"),
    $subjectTypeahead = $("input.subject-typeahead"),
    $subjectDatabaseTypeahead = $("input.database-subject-typeahead");

  // typeahead common options
  let buildtypeaheadOptions = function(count){
    count = count || 0;
    return {
      highlight: true,
      minLength: count,
      classNames: {
        highlight: "font-weight-bold",
        dataset: "tt-dataset list-group",
        menu: "tt-menu small text-dark scrollable",
        cursor: "tt-cursor"
      }
    };
  };

  // START LibAnswers FAQ Typeahead
  if ( $faqTypeahead.length ) {
    // Data source for ALL LibAnswers FAQs.
    let faqList = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("question", "topics"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      identify: function(obj) { return obj.question; },
      remote: {
        url: libutils.sprinshareUrls.answer_faqs,
        wildcard: "%QUERY",
        prepare: function(query, settings){
          settings.dataType = "jsonp";
          settings.url = settings.url.replace("%QUERY", query);
          return settings;
        },
        transform: function(response){

          let transformed = $.map(response.data.search.results, function (value) {
            let topicsArray =  $.map(value.topics, function(n,i){
              return [ n ];
            });
            return {
              id: value.id,
              question: value.question,
              topics: topicsArray.join(", "),
              url: value.url
            };
          });
          return transformed;
        }
      }
    });

    // Setup typahead for subject typeahead.
    $faqTypeahead.typeahead( buildtypeaheadOptions(1), {
        name: "faqList",
        source: faqList,
        display: "question",
        limit: 200,
        templates: {
          suggestion: function(data) {
            return "<div class=\"list-group-item list-group-item-action\">" + data.question + "</div>";
          },
          header:function() {
            return "<div class=\"list-group-item list-group-item-info\">" +
              "Showing FAQs that contain one or more of your keywords. " +
              "Don't see a relevant question? Refine your terms or <a class=\"text-dark font-weight-bold\" href=\"/ask-us/\">Ask Us</a>.</div>";
          },
          notFound:function() {
            return "<div class=\"list-group-item list-group-item-dark\">Don't see what you're looking for?." +
              " <a class=\"text-dark font-weight-bold\" href=\"/ask-us/\">Ask Us</a> and we'll respond with 24-48 hours.</div>";
          }
        }
      }
    ).on("typeahead:selected", function(event, datum) {
      libutils.goToUrl(datum);
    });
  }
  // END LibAnswers FAQ Typeahead

  // Start subject listings
  if ( $subjectTypeahead.length || $subjectDatabaseTypeahead.length ) {

    // Data source for All LibGuides "subjects".
    let allSubjects = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      prefetch: {
        url: libutils.sprinshareUrls.subjects_list,
        cache: true,
        transform: function(response){
          let transformed = $.map(response, function (option) {
            return {
              id: option.id,
              name: option.name
            };
          });
          return transformed;
        }
      }
    });

    // Provide a default to subject queries. On focus of the input, search for pre-defined best bets, otherwise, just search.
    function subjectSearchWithDefaults(q, sync) {
      if (q === "") {
        sync(allSubjects.index.all());
      }
      else {
        allSubjects.search(q, sync);
      }
    }

    // Setup typahead for subject typeahead.
    $subjectTypeahead.typeahead( buildtypeaheadOptions(0),  {
        name: "allSubjects",
        source: subjectSearchWithDefaults,
        display: "name",
        limit: 200,
        templates: {
          suggestion: function(data) {
            return "<div class=\"list-group-item d-flex justify-content-between align-items-center\" role=\"link\"><div>" +
              data.name +
              "</div><i class=\"fas fa-external-link-alt\" aria-hidden=\"true\" title=\"external link to " + data.name + "\"></i></div>";
          }
        }
      }
    ).on("typeahead:selected", function(event, datum) {
      let path = "//guides.library.unt.edu/sb.php?subject_id=";
      libutils.goToSubjectUrl(datum, path);
    });


    // Setup typahead for database subject listing.
    $subjectDatabaseTypeahead.typeahead( buildtypeaheadOptions(0),  {
        name: "allSubjects",
        source: subjectSearchWithDefaults,
        display: "name",
        limit: 200,
        templates: {
          suggestion: function(data) {
            return "<div class=\"list-group-item d-flex justify-content-between align-items-center\" role=\"link\"><div>" +
              data.name +
              "</div><i class=\"fas fa-external-link-alt\" aria-hidden=\"true\" title=\"external link to " + data.name + "\"></i></div>";
          }
        }
      }
    ).on("typeahead:selected", function(event, datum) {
      let path = "//guides.library.unt.edu/az.php?s=";
      libutils.goToSubjectUrl(datum, path);
    });
  }
  // End subject listings

  // Start databases typeahead
  if ( $azTypeahead.length ) {

    let azList,
      currentDate = new Date();

    function makeAZList(){
      // Data source for LibGuides powered A-Z Database listing.
      azList = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name", "description", "new", "trial", "subjects", "alt_names"),
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        identify: function(obj) { return obj.id; },
        local: JSON.parse(sessionStorage.getItem('springshareAzWithSubjects')),
      });
      //console.log(azList);
      return azList;
    }
    // Provide a default to database queries. On focus of the input, search for pre-defined best bets, otherwise, just search.
    function databaseSearchWithDefaults(q, sync) {
      if (q === "") {
        sync(azList.get([2477452, 2478596, 2479459, 2477894, 2478101,2478940]));
        //"Academic Search Complete", "EBSCOhost", "JSTOR", "Nexis Uni", "ScienceDirect", "Web of Science"
      }
      else {
        azList.search(q, sync);
      }
    }


// Test if libguides database API response is in session storage or the data is older than 1 day.
    if (sessionStorage.getItem("springshareAzWithSubjects") === null || currentDate.getTime() > sessionStorage.getItem('springshareAzExpires') ) {
      // JSON doesn't exists in Session Storage yet or the data is stale.

      // add a 'loading' placeholder
      $azTypeahead.attr("placeholder", "loading suggestions!");

      // Make a request against the API
      $.when($.get( libutils.sprinshareUrls.databases )).done((data) => {
        // Transform the Data
        let springshareTransformed = $.map(data, function (option) {
          let textDescription = option.description.replace(/<\/?[^>]+>/gi, '').replace(/"/g, "'"), // strip any markup in descriptions
            urlPath = ( !!+option.meta.enable_proxy ) ? "https://libproxy.library.unt.edu/login?url=" + option.url : option.url, // if proxy enabled, add it to the url, otherwise just the url
            recentlyAdded = (option.enable_new === 1) ? "recently added" : "", // boilerplate in searchable text for 'new' items
            isTrial = (option.enable_trial === 1) ? "under consideration" : "", // boilerplate in searchable text for 'trials'
            subjects = ( option.hasOwnProperty('subjects') ) ? option.subjects : [], // get subject object if it exists.
            subjectString = ( subjects.length ) ? "<br /><strong>Subjects: </strong>" : ""; // if exists, generate a prefix
          subjectString += subjects.map(function(subject){
            return subject.name;
          }).join(", "); // concat the prefix with a comma seperated subject list.

          return {
            id: option.id,
            name: option.name,
            description: textDescription,
            url: urlPath,
            new: recentlyAdded,
            trial: isTrial,
            subjects: subjectString,
            alt_names: option.alt_names
          };
        });
        // Add the transformed json to session storage
        sessionStorage.setItem('springshareAzWithSubjects', JSON.stringify(springshareTransformed));
        // calculate today + 24 hours and set that as a max cache time for the data, also to session strorage.
        let plusTwentyFour = currentDate.getTime() + 86400000;
        sessionStorage.setItem('springshareAzExpires', plusTwentyFour);

        // create bloodhound
        makeAZList();

        // update the placeholder with instructions.
        $azTypeahead.attr("placeholder", "type for suggestions");

      });

    } else {
      // JSON already stored in session stroage, timestamp is less than 24 hours old; create bloodhound
      makeAZList();
    }



    // Setup for the Datases Typeahead.
    $azTypeahead.typeahead( buildtypeaheadOptions(0), {
      name: "azList",
      minLength: 2,
      source: databaseSearchWithDefaults,
      limit: 50,
      display: "name",
      templates: {
        suggestion: function(data) {

          let isNew = (data.new) ? `<span class="badge badge-info small align-self-center">new</span>` : "",
            isTrial = (data.trial) ? `<span class="badge badge-info small align-self-center">trial</span>` : "";

          return `<div class="list-group-item d-flex" role="link"><div class="flex-grow-1">${data.name}</div>` +
            isNew + isTrial +
            `<i class="fas fa-info pl-3 d-none d-md-inline-block align-self-center" data-database="description" data-content="${data.description} ${data.subjects} " title="${data.name}" id="lg-id-${data.id}" aria-hidden="true"></i>` +
            "</div>";
        },
        notFound: function(){
          return `<div class="list-group-item">No match found. Try alternatives or use fewer terms</div>`
        }
      }
    }).on("focusin", function(){
      $(this).attr("placeholder", "try these best bets or search for your own.");
    }).on("focusout", function(){
      $(this).attr("placeholder", "type for suggestions");
    }).on("typeahead:selected", function(event, datum) {
      libutils.goToUrl(datum);
    });

    let $recentDBs = $("#recent-dbs"),
      $trialDBs = $("#trial-dbs");

    $recentDBs.on('click', function(e){
      e.preventDefault();
      $("#az-search").typeahead("val", "recently added").focus();
    });

    $trialDBs.on('click', function(e){
      e.preventDefault();
      $("#az-search").typeahead("val", "under consideration").focus();
    });


    let DBpopOverSettings = {
      container: 'body',
      trigger: 'hover',
      selector: '[data-database="description"]',
      boundary: 'viewport',
      placement: 'right',
      html: true
    };

    // highlight search string in popover
    $('div.database-group').popover(DBpopOverSettings)
      .on('inserted.bs.popover', function (e) {

        let searchVal = $(e.target).closest(".twitter-typeahead").find(".tt-input").val(),
          terms = searchVal.split(" "),
          $thisPopover = $("body").find(".popover-body");

        if (searchVal.length && window.Mark) {

          $thisPopover.mark(terms , {
            "element": "strong",
            "className": "text-success p-1"
          });


        }
      });
  }
  // End databases typeahead


  // Start Shared Bloodhound for course/guide listing
  if ( $studentHelper.length || $courseTypeAhead.length ) {

    // Data source for All LibGuides "guides".
    let allLibGuides = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name", "description", "subjects", "type_machine"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      identify: function(obj) { return obj.name; },
      prefetch: {
        url: libutils.sprinshareUrls.guides_expand_owner_subject,
        cache: true,
        transform: function(response){
          let transformed = $.map(response, function (option) {
            let subjectsArray =  $.map(option.subjects, function(n,i){
              return [ n.name ];
            });
            return {
              id: option.id,
              name: option.name,
              description: option.description,
              url: option.friendly_url || option.url,
              type_label: option.type_label,
              type_machine: option.type_label.toLowerCase().replace(" ","-").concat("-",option.type_id),
              subjects: subjectsArray.join(", ")
            };
          });
          return transformed;
        }
      }
    });

    // Provide a default to database queries. On focus of the input, search for pre-defined best bets, otherwise, just search.
    function coursesSource(q, sync) {
      allLibGuides.search(q + " course-guide-2", sync);
    }

    // Setup typahead for course finder
    $courseTypeAhead.typeahead( buildtypeaheadOptions(0),  {
        name: "coursesSource",
        source: coursesSource,
        display: "name",
        limit: 500,
        templates: {
          suggestion: function(data) {
            return "<div class=\"list-group-item d-flex justify-content-between align-items-center\" role=\"link\"><div>" +
              data.name +
              "</div><i class=\"fas fa-external-link-alt\" aria-hidden=\"true\" title=\"external link to " + data.name + "\"></i></div>";
          }
        }
      }
    ).on("typeahead:selected", function(event, datum) {
      libutils.goToUrl(datum);
    });


    // Data source for subject librarians in typeaheads.
    let librarians = new Bloodhound({
      datumTokenizer: Bloodhound.tokenizers.obj.whitespace("name", "job_title", "liaison_notes", "academic_units_string", "subjects"),
      queryTokenizer: Bloodhound.tokenizers.whitespace,
      prefetch: libutils.siteDomain + "/assets/data/subject-librarians.json"
    });


    // Setup typahead for homepage multi-source search box. Combines subject librarians, and guides into single output.
    $studentHelper.typeahead( buildtypeaheadOptions(0),  {
        name: "librarians",
        source: librarians,
        display: "name",
        templates: {
          suggestion: function(data) {
            return "<div class=\"list-group-item list-group-item-action d-flex align-items-center\"><div>" +
              "<h5 class=\"h6\">" + data.name + " <small> &mdash; " + data.job_title + "</small></h5>" +
              "<strong>Phone: </strong>" + data.phone + "<br />" +
              "<strong>Serving: </strong>" + data.academic_units_served +
              "</div><span class=\"ml-auto badge badge-dark\">subject librarian</span></div>" +
              "</div>";
          }
        }
      },
      {
        name: "allLibGuides",
        source: allLibGuides,
        display: "name",
        limit: 20,
        templates: {
          suggestion: function(data) {

            let guideType, badgeType;

            if (data.type_label === "Course Guide") {
              badgeType = "info";
            } else {
              badgeType = "success";
            }

            return "<div class=\"list-group-item list-group-item-action d-flex align-items-center\"><div>" + data.name +
              "</div><span class=\"ml-auto badge badge-" + badgeType + "\">" + data.type_label + "</span></div>";
          }
        }
      }
    ).on("typeahead:selected", function(event, datum) {
      libutils.goToUrl(datum);
    });
  }
  // End student helper typeahead (has multiple bloodhound sources)





});
