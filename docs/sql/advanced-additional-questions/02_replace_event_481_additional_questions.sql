-- Replace only event 481's additional-question configuration.
-- This deletes its existing custom-question definitions and their saved
-- custom-question/advanced answers. It leaves the event, registrations,
-- audio settings, tickets, and all other event data unchanged.
-- Run this whole file with SQL Scripts / Run Script in WKSP_GCODE2.

DECLARE
  c_event_id CONSTANT NUMBER := 481;
  l_event_count NUMBER;
  l_question_id NUMBER;
  l_option_id NUMBER;

  TYPE t_labels IS TABLE OF VARCHAR2(200);

  PROCEDURE add_question(
    p_prompt      VARCHAR2,
    p_type        VARCHAR2,
    p_required    NUMBER,
    p_sort_order  NUMBER,
    p_question_id OUT NUMBER
  ) IS
  BEGIN
    INSERT INTO gcode_event_questions
      (event_id, prompt, question_type, is_required, applies_to, sort_order)
    VALUES
      (c_event_id, p_prompt, p_type, p_required, 'ATTENDEE', p_sort_order)
    RETURNING id INTO p_question_id;
  END;

  PROCEDURE add_question_option(
    p_question_id NUMBER,
    p_label       VARCHAR2,
    p_sort_order  NUMBER,
    p_option_id   OUT NUMBER
  ) IS
  BEGIN
    INSERT INTO gcode_event_question_options (question_id, option_label, sort_order)
    VALUES (p_question_id, p_label, p_sort_order)
    RETURNING id INTO p_option_id;
  END;

  PROCEDURE add_other_setting(
    p_question_id NUMBER,
    p_option_id   NUMBER
  ) IS
  BEGIN
    INSERT INTO gcode_event_adv_option_settings
      (event_id, question_id, source_option_id, parent_adv_option_id,
       is_enabled, is_required, allow_other)
    VALUES
      (c_event_id, p_question_id, p_option_id, NULL, 0, 0, 1);
  END;

  PROCEDURE add_service_category(
    p_question_id NUMBER,
    p_label       VARCHAR2,
    p_sort_order  NUMBER,
    p_children    t_labels
  ) IS
    l_source_option_id NUMBER;
    l_child_setting_id NUMBER;
  BEGIN
    add_question_option(p_question_id, p_label, p_sort_order, l_source_option_id);

    INSERT INTO gcode_event_adv_option_settings
      (event_id, question_id, source_option_id, parent_adv_option_id,
       is_enabled, is_required, allow_other)
    VALUES
      (c_event_id, p_question_id, l_source_option_id, NULL, 1, 1, 0)
    RETURNING id INTO l_child_setting_id;

    FOR i IN 1 .. p_children.COUNT LOOP
      INSERT INTO gcode_event_adv_options
        (setting_id, option_label, sort_order, is_active)
      VALUES
        (l_child_setting_id, p_children(i), i - 1, 1);
    END LOOP;
  END;

  PROCEDURE add_text_question(
    p_prompt      VARCHAR2,
    p_required    NUMBER,
    p_sort_order  NUMBER
  ) IS
    l_ignored_id NUMBER;
  BEGIN
    add_question(p_prompt, 'TEXT', p_required, p_sort_order, l_ignored_id);
  END;

BEGIN
  SELECT COUNT(*) INTO l_event_count FROM events WHERE id = c_event_id;
  IF l_event_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20481, 'Event 481 was not found');
  END IF;

  -- Remove the old advanced configuration first. The dependent advanced
  -- answers are removed before choices because ADV_OPTION_ID is restrictive.
  DELETE FROM gcode_event_adv_answers a
   WHERE EXISTS (
     SELECT 1
       FROM gcode_event_adv_option_settings s
      WHERE s.id = a.setting_id
        AND s.event_id = c_event_id
   );
  DELETE FROM gcode_event_adv_option_settings WHERE event_id = c_event_id;

  -- Deleting questions cascades to their old options and participant answers.
  DELETE FROM gcode_event_questions WHERE event_id = c_event_id;

  -- Question 1: business type, multi-select, required.
  add_question('What is your business type?', 'CHECKBOX', 1, 0, l_question_id);
  add_question_option(l_question_id, 'Industry Expert', 0, l_option_id);
  add_question_option(l_question_id, 'Service Provider', 1, l_option_id);
  add_question_option(l_question_id, 'Investor', 2, l_option_id);
  add_question_option(l_question_id, 'Other (please specify)', 3, l_option_id);
  add_other_setting(l_question_id, l_option_id);

  -- Question 2: required service category multi-select, with a required
  -- follow-up group for each selected category.
  add_question('Please mention your business category', 'CHECKBOX', 1, 1, l_question_id);

  add_service_category(l_question_id, 'Idea & Market Validation', 0,
    t_labels('Idea Validation', 'Market Research', 'Feasibility Study',
             'Competitor Benchmarking', 'Solution Modelling'));
  add_service_category(l_question_id, 'Business & Financial Planning', 1,
    t_labels('Business Modelling', 'Pricing Strategy', 'Go-to-Market Plan',
             'Budget Projections', 'Funding Strategy', 'Revenue & Fund Management'));
  add_service_category(l_question_id, 'Founders & Company Setup', 2,
    t_labels('Founder Alignment', 'Equity & Stakeholding', 'Company Type Selection',
             'Company Name & Trademark', 'Entity Registration',
             'Director & Governance Modelling', 'PAN / TAN / GST', 'Bank Account Setup'));
  add_service_category(l_question_id, 'Branding & Digital Presence', 3,
    t_labels('Brand Name Finalisation', 'Logo & Brand Identity',
             'Website Creation', 'Digital Marketing'));
  add_service_category(l_question_id, 'Product & Technology', 4,
    t_labels('Product Development', 'Intellectual Property (IP)',
             'Automation Solutions', 'Agentic AI & Plugins'));
  add_service_category(l_question_id, 'Team & Operations', 5,
    t_labels('Intern Hiring', 'Team Hiring', 'Process Mapping',
             'Accounting & Bookkeeping', 'Quality Management'));
  add_service_category(l_question_id, 'Sales & Business Growth', 6,
    t_labels('Sales Development', 'Channel Partner Development',
             'Product-Market Fit', 'Customer Feedback & Improvement'));
  add_service_category(l_question_id, 'Funding & Ecosystem', 7,
    t_labels('Investor Pitch Deck', 'Grants & Funding Opportunities',
             'Incubator & Accelerator Access', 'Strategic Partnerships', 'Alliances & MOUs'));
  add_question_option(l_question_id, 'Other (please specify)', 8, l_option_id);
  add_other_setting(l_question_id, l_option_id);

  -- Remaining short-answer questions, in the requested order.
  add_text_question('Business Name', 1, 2);
  add_text_question('Website URL', 0, 3);
  add_text_question('Business Email', 0, 4);
  add_text_question('Address Line 1', 0, 5);
  add_text_question('Address Line 2', 0, 6);
  add_text_question('City', 1, 7);
  add_text_question('State', 1, 8);
  add_text_question('Country', 1, 9);
  add_text_question('Pin Code', 1, 10);

  MERGE INTO gcode_event_adv_q_settings d
  USING (SELECT c_event_id AS event_id FROM dual) s
     ON (d.event_id = s.event_id)
  WHEN MATCHED THEN UPDATE SET d.advanced_enabled = 1
  WHEN NOT MATCHED THEN INSERT (event_id, advanced_enabled) VALUES (s.event_id, 1);

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Event 481 additional questions replaced successfully.');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
